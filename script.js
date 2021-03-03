import { composeCreatePullRequest } from "octokit-plugin-create-pull-request";

let pkgLockfile;

/**
 * Upgrade current scripts to use the built-in CLI
 *
 * @param {import('@octoherd/cli').Octokit} octokit
 * @param {import('@octoherd/cli').Repository} repository
 */
export async function script(octokit, repository) {
  const owner = repository.owner.login;
  const repo = repository.name;

  if (!/^script-/.test(repo)) {
    octokit.log.info("Ignoring %s, not a script repository", repo);
    return;
  }

  // load package-lock.json file contents from octoherd/script-star-or-unstar
  pkgLockfile =
    pkgLockfile ||
    JSON.parse(
      (
        await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
          mediaType: {
            format: "raw",
          },
          owner: "octoherd",
          repo: "script-star-or-unstar",
          path: "package-lock.json",
        })
      ).data
    );

  const { data: pr } = await composeCreatePullRequest(octokit, {
    owner,
    repo,
    title: "feat: CLI",
    body: `This pull requests enables this script to be run directly via \`npx @octoherd/${repo}\``,
    head: "cli",
    changes: [
      {
        files: {
          "cli.js": `#!/usr/bin/env node

import { script } from "./script.js";
import { run } from "@octoherd/cli/run";

run(script);
`,
        },
        commit: "feat: cli",
      },
      {
        files: {
          "package.json": ({ encoding, content }) => {
            const pkg = JSON.parse(
              Buffer.from(content, encoding).toString("utf-8")
            );

            pkg.bin = {
              [`octoherd-${repo}`]: "./cli.js",
            };

            pkg.devDependencies = {};
            pkg.dependencies = {
              "@octoherd/cli": "^2.7.1",
            };

            return JSON.stringify(pkg, null, 2) + "\n";
          },
        },
        commit: "build(deps): replace dependencies with `@octoherd/cli`",
      },
      {
        files: {
          "package-lock.json": () => {
            return (
              JSON.stringify(
                {
                  ...pkgLockfile,
                  name: `@octoherd/${repo}`,
                },
                null,
                2
              ) + "\n"
            );
          },
        },
        commit: "build(deps): lock file",
      },
      {
        files: {
          "script.js": ({ encoding, content }) => {
            const scriptContent = Buffer.from(content, encoding).toString(
              "utf-8"
            );

            return scriptContent
              .replace("@octoherd/octokit", "@octoherd/cli")
              .replace(
                'import(\'@octokit/openapi-types\').components["schemas"]["repository"]',
                "import('@octoherd/cli').Repository"
              );
          },
          "README.md": ({ encoding, content }) => {
            const readmeContent = Buffer.from(content, encoding).toString(
              "utf-8"
            );

            return readmeContent
              .replace(/git clone .*\n/, "")
              .replace("npx @octoherd/cli", `npx @octoherd/${repo}`)
              .replace(
                "script-close-renovate-dashboard-issues/script.js \\\n",
                ""
              );
          },
        },
        commit: "refactor: adapt for `@octoherd/cli`",
      },
    ],
  });

  octokit.log.info("Pull request created: %s", pr.html_url);
}
