const fs = require("fs");
const path = require("path");

test("defines and exports the root app component", () => {
  const source = fs.readFileSync(path.join(__dirname, "App.js"), "utf8");

  expect(source).toContain("function App()");
  expect(source).toContain("export default App");
});
