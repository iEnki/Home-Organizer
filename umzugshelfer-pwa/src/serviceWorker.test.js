import fs from "fs";
import path from "path";
import vm from "vm";

const loadWorker = () => {
  const handlers = {};
  const context = {
    URL,
    self: {
      location: { origin: "https://example.test" },
      registration: {
        showNotification: jest.fn().mockResolvedValue(undefined),
        pushManager: { subscribe: jest.fn().mockResolvedValue({}) },
      },
      addEventListener: (name, handler) => { handlers[name] = handler; },
    },
    clients: {
      matchAll: jest.fn().mockResolvedValue([]),
      openWindow: jest.fn().mockResolvedValue(undefined),
    },
    console,
  };
  const source = fs.readFileSync(path.join(process.cwd(), "public", "service-worker.js"), "utf8");
  vm.runInNewContext(source, context);
  return { handlers, context };
};

test("shows JSON push payloads", async () => {
  const { handlers, context } = loadWorker();
  let work;
  handlers.push({
    data: { json: () => ({ title: "Titel", body: "Text", url: "/home/kfz", tag: "kfz" }) },
    waitUntil: (promise) => { work = promise; },
  });
  await work;

  expect(context.self.registration.showNotification).toHaveBeenCalledWith(
    "Titel",
    expect.objectContaining({
      body: "Text",
      tag: "kfz",
      data: { url: "/home/kfz" },
    }),
  );
});

test("opens only same-origin notification targets", async () => {
  const { handlers, context } = loadWorker();
  let work;
  handlers.notificationclick({
    notification: {
      close: jest.fn(),
      data: { url: "https://attacker.invalid/path" },
    },
    waitUntil: (promise) => { work = promise; },
  });
  await work;

  expect(context.clients.openWindow).toHaveBeenCalledWith("https://example.test");
});

test("broadcasts subscription changes to open clients", async () => {
  const { handlers, context } = loadWorker();
  const postMessage = jest.fn();
  context.clients.matchAll.mockResolvedValue([{ postMessage }]);
  let work;
  handlers.pushsubscriptionchange({
    oldSubscription: { options: { userVisibleOnly: true } },
    waitUntil: (promise) => { work = promise; },
  });
  await work;

  expect(postMessage).toHaveBeenCalledWith({ type: "PUSH_SUBSCRIPTION_CHANGED" });
});
