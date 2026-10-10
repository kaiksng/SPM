import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// findBy*/waitFor give up after 1s by default. A loaded CI runner (or a busy
// laptop running all files in parallel) can take longer than that to mount
// portal content such as Base UI selects, menus and popovers, which made
// tests fail intermittently. 3s keeps genuine failures fast while removing
// that flakiness for every test at once.
configure({ asyncUtilTimeout: 3000 });
