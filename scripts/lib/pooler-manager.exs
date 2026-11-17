# Runs after migrations and before tenant provisioning/server startup. Read the
# encrypted field as raw data so a wrong old key cannot prevent Ecto row loading.
defmodule UmzugPoolerManager do
  @select "SELECT id::text, db_user, db_pass_encrypted FROM _supavisor.users WHERE tenant_external_id = $1 AND is_manager = true"
  @update "UPDATE _supavisor.users SET db_pass_encrypted = $1, updated_at = now() WHERE id::text = $2 AND tenant_external_id = $3 AND is_manager = true AND db_user = 'pgbouncer' AND db_pass_encrypted IS NOT DISTINCT FROM $4"

  def sync! do
    {:ok, _} = Application.ensure_all_started(:supavisor)
    sync!(System.fetch_env!("POOLER_TENANT_ID"), System.fetch_env!("POSTGRES_PASSWORD"))
  end

  def sync!(tenant_id, password)
      when is_binary(tenant_id) and tenant_id != "" and is_binary(password) and password != "" do
    # Validate even for a new tenant, before the original bootstrap encrypts a
    # real password. Library exceptions may embed both plaintext and key bytes.
    probe = "pooler-manager-key-check"
    case decrypt(encrypt!(probe)) do
      {:ok, ^probe} -> :ok
      _ -> raise "Pooler manager credential encryption failed"
    end
    case Supavisor.Repo.query(@select, [tenant_id], log: false) do
      {:ok, %{rows: []}} ->
        # The existing installation-specific bootstrap will provision a new tenant.
        :ok

      {:ok, %{rows: [[id, "pgbouncer", encrypted]]}} ->
        case decrypt(encrypted) do
          {:ok, ^password} -> :ok
          _ -> repair!(id, tenant_id, password, encrypted)
        end

      {:ok, %{rows: [[_, _, _]]}} ->
        IO.warn("Custom pooler manager retained; automatic credential synchronization skipped")
        :ok

      _ ->
        raise "Pooler manager lookup failed or returned ambiguous managers"
    end
  end

  def sync!(_, _), do: raise("Pooler tenant and password must be configured")

  defp repair!(id, tenant_id, password, previous) do
    # Use the actual encrypted Ecto type/current key. Only encrypted bytes are
    # sent to SQL, with query logging disabled. All unrelated row fields survive.
    encrypted = encrypt!(password)
    case Supavisor.Repo.query(@update, [encrypted, id, tenant_id, previous], log: false) do
      {:ok, %{num_rows: 1}} -> :ok
      _ -> raise "Pooler manager credential synchronization failed"
    end
  end

  defp encrypt!(plaintext) do
    result = try do
      Supavisor.Encrypted.Binary.dump(plaintext)
    rescue
      _ -> :error
    end
    case result do
      {:ok, encrypted} when is_binary(encrypted) ->
        encrypted

      _ ->
        raise "Pooler manager credential encryption failed"
    end
  end

  defp decrypt(encrypted) do
    result = try do
      Supavisor.Encrypted.Binary.load(encrypted)
    rescue
      _ -> :crypto_exception
    end
    case result do
      :crypto_exception -> raise "Pooler manager credential decryption failed"
      value -> value
    end
  end
end
