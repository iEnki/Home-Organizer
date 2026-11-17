ExUnit.start()

# Exercise the real bootstrap code with generated data/service doubles. Actual
# Ecto cryptography, PostgreSQL and both ports are separate CT acceptance checks.
defmodule Supavisor.Repo do
  def query(sql, params, opts) do
    if opts != [log: false], do: raise("Query logging must be disabled")
    send(self(), {:query, sql, params})
    if String.starts_with?(sql, "SELECT") do
      {:ok, %{rows: Process.get(:rows, [])}}
    else
      if Process.get(:fail_update) do
        {:error, :generated_failure}
      else
        [encrypted, id, _, _] = params
        count = Process.get(:update_count, 1)
        if count == 1, do: Process.put(:rows, [[id, "pgbouncer", encrypted]])
        {:ok, %{num_rows: count}}
      end
    end
  end
end

defmodule Supavisor.Encrypted.Binary do
  def load("active:" <> password), do: {:ok, password}
  def load(_), do: :error
  def dump(password) do
    if Process.get(:fail_encryption), do: :error, else: {:ok, "active:" <> password}
  end
end

Code.require_file("../lib/pooler-manager.exs", __DIR__)

defmodule PoolerManagerContract do
  use ExUnit.Case, async: true

  defp updates do
    receive do
      {:query, "UPDATE" <> _ = sql, params} -> [{sql, params} | updates()]
      {:query, _, _} -> updates()
    after
      0 -> []
    end
  end

  test "wrong key repairs only scoped encrypted credentials and is idempotent" do
    Process.put(:rows, [["existing-id", "pgbouncer", "old-key-cipher"]])
    assert :ok = UmzugPoolerManager.sync!("generated-tenant", "generated-current")
    assert_received {:query, "SELECT" <> _, ["generated-tenant"]}
    assert [{sql, ["active:generated-current", "existing-id", "generated-tenant", "old-key-cipher"]}] = updates()
    assert sql =~ "tenant_external_id = $3"
    assert sql =~ "is_manager = true"
    assert sql =~ "db_user = 'pgbouncer'"
    assert sql =~ "IS NOT DISTINCT FROM $4"
    assert sql =~ "SET db_pass_encrypted = $1, updated_at = now()"
    assert :ok = UmzugPoolerManager.sync!("generated-tenant", "generated-current")
    assert updates() == []
  end

  test "changed database password is synchronized" do
    Process.put(:rows, [["existing-id", "pgbouncer", "active:generated-old"]])
    assert :ok = UmzugPoolerManager.sync!("generated-tenant", "generated-new")
    assert [{_, ["active:generated-new", _, _, _]}] = updates()
  end

  test "matching credentials and not-yet-provisioned tenant do not write" do
    for rows <- [[], [["existing-id", "pgbouncer", "active:generated-current"]]] do
      Process.put(:rows, rows)
      assert :ok = UmzugPoolerManager.sync!("generated-tenant", "generated-current")
      assert updates() == []
    end
  end

  test "custom manager is retained" do
    Process.put(:rows, [["custom-id", "custom", "old-key-cipher"]])
    assert ExUnit.CaptureIO.capture_io(:stderr, fn ->
      assert :ok = UmzugPoolerManager.sync!("generated-tenant", "generated-current")
    end) =~ "Custom pooler manager retained"
    assert updates() == []
  end

  test "ambiguous managers fail without write" do
    Process.put(:rows, [["one", "pgbouncer", "old"], ["two", "pgbouncer", "old"]])
    assert_raise RuntimeError, "Pooler manager lookup failed or returned ambiguous managers", fn ->
      UmzugPoolerManager.sync!("generated-tenant", "generated-current")
    end
    assert updates() == []
  end

  test "invalid config fails without write" do
    for args <- [{"", "password"}, {"tenant", ""}, {nil, "password"}] do
      assert_raise RuntimeError, "Pooler tenant and password must be configured", fn ->
        apply(UmzugPoolerManager, :sync!, Tuple.to_list(args))
      end
    end
    assert updates() == []
  end

  test "encryption failure leaves original credentials" do
    Process.put(:rows, [["existing-id", "pgbouncer", "old-key-cipher"]])
    Process.put(:fail_encryption, true)
    assert_raise RuntimeError, "Pooler manager credential encryption failed", fn ->
      UmzugPoolerManager.sync!("generated-tenant", "generated-current")
    end
    assert updates() == []
    assert Process.get(:rows) == [["existing-id", "pgbouncer", "old-key-cipher"]]
  end

  test "write failure and concurrent change do not report success" do
    for {key, value} <- [{:fail_update, true}, {:update_count, 0}] do
      Process.put(:rows, [["existing-id", "pgbouncer", "old-key-cipher"]])
      Process.put(key, value)
      assert_raise RuntimeError, "Pooler manager credential synchronization failed", fn ->
        UmzugPoolerManager.sync!("generated-tenant", "generated-current")
      end
      assert Process.get(:rows) == [["existing-id", "pgbouncer", "old-key-cipher"]]
      Process.delete(key)
    end
  end

  test "crypto exceptions terminate without exposing passwords or keys in subprocess logs" do
    source = Path.expand("../lib/pooler-manager.exs", __DIR__)
    for {mode, stage} <- [{"dump", "encryption"}, {"load", "decryption"}, {"fresh", "encryption"}] do
      script = """
      defmodule Supavisor.Repo do
        def query(_, _, _) do
          rows = if #{inspect(mode)} == "fresh", do: [], else: [["id", "pgbouncer", "old-cipher"]]
          {:ok, %{rows: rows}}
        end
      end
      defmodule Supavisor.Encrypted.Binary do
        def load(_) do
          if #{inspect(mode)} == "load", do: :erlang.error({:badarg, ["generated-secret-password", "generated-secret-key"]})
          :error
        end
        def dump(_) do
          if #{inspect(mode)} in ["dump", "fresh"], do: :erlang.error({:badarg, ["generated-secret-password", "generated-secret-key"]})
          {:ok, "probe-cipher"}
        end
      end
      Code.require_file(#{inspect(source)})
      UmzugPoolerManager.sync!("generated-tenant", "generated-secret-password")
      """
      {output, status} = System.cmd(System.find_executable("elixir"), ["--eval", script], stderr_to_stdout: true)
      assert status != 0
      assert output =~ "Pooler manager credential #{stage} failed"
      refute output =~ "generated-secret-password"
      refute output =~ "generated-secret-key"
    end
  end
end
