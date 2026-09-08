import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { phase3DependencyPolicyFindings } from "../support/dependency-policy";

describe("Phase 3 offline dependency/license policy", () => {
  it("revalidates the frozen lock without registry or advisory calls", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    const packageLock = JSON.parse(
      readFileSync(resolve(process.cwd(), "package-lock.json"), "utf8")
    );
    expect(packageJson.dependencies["@neondatabase/auth-ui"]).toBe(
      "file:vendor/neon-auth-ui-disabled"
    );
    expect(packageJson.overrides["@neondatabase/auth-ui"]).toBe("$@neondatabase/auth-ui");
    expect(packageLock.packages["node_modules/@neondatabase/auth-ui"]).toEqual({
      resolved: "vendor/neon-auth-ui-disabled",
      link: true,
    });
    expect(packageLock.packages["vendor/neon-auth-ui-disabled"]).toMatchObject({
      name: "@neondatabase/auth-ui",
      version: "0.3.0-beta-distil-disabled",
      license: "UNLICENSED",
    });
    expect(phase3DependencyPolicyFindings(packageJson, packageLock)).toEqual([]);
  });

  it("passes a pinned, compatible, permissively licensed graph", () => {
    expect(
      phase3DependencyPolicyFindings(
        { dependencies: { "@neondatabase/auth": "0.5.0-beta" } },
        {
          packages: {
            "node_modules/@neondatabase/auth": { version: "0.5.0-beta", license: "Apache-2.0" },
            "node_modules/@neondatabase/auth-ui/node_modules/better-auth": {
              version: "1.7.3",
              license: "MIT",
            },
            "node_modules/@neondatabase/auth-ui/node_modules/@daveyplate/better-auth-ui/node_modules/@better-auth/api-key":
              {
                version: "1.7.3",
                license: "MIT",
                peerDependencies: { "better-auth": "^1.7.3" },
              },
          },
        }
      )
    ).toEqual([]);
  });
});
