/**
 * @fileoverview Description of this file.
 */
const path = require("path");
const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const app = express();
const fetch = require("node-fetch");

app.use(express.json());
// Serve static files from the 'public' directory
const rootPath = process.cwd();
app.use(express.static(path.join(rootPath, "public")));
const outputDir = rootPath + "public/lighthouse-reports";

const testInputs = {
  urls: [
    "https://workspace.google.com/intl/en_au/lp/gmail-au/index.html",
    "https://workspace.google.com/intl/en_in/lp/gmail-in/index.html",
    "https://workspace.google.com/intl/es_ALL/",
  ],
};

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Executes the lighthouse command for a given URL.
 * @param {string} cmd - The lighthouse command to execute.
 * @returns {!Promise<void>} - A promise that resolves when the audit is complete.
 */
const runCommands = (cmd) => {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd: rootPath }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error running command for ${cmd}:`, stderr);
        reject(error);
      } else {
        console.log(`Command propmty executed for ${cmd} - ${stdout}`);
        resolve();
      }
    });
  });
};

/**
 * Executes the lighthouse command for a given URL.
 * @param {string} url - The URL to audit.
 * @param {!object} config - The configuration for the audit.
 * @returns {!Promise<void>} - A promise that resolves when the audit is complete.
 */
const runLighthouse = (url, config) => {
  return new Promise((resolve, reject) => {
    const {
      output = ["json", "html"],
      categories = ["accessibility"],
      chromeFlags = ["--headless", "--no-sandbox"],
      maxWaitForLoad = 60000,
      outputPath,
    } = config;

    // const outputOptions = output.map(o => `--output=${o}`).join(' ');
    const categoriesOptions = categories
      .map((c) => `--only-categories=${c}`)
      .join(" ");
    const chromeFlagsOptions = chromeFlags
      .map((f) => `--chrome-flags="${f}"`)
      .join(" ");
    const cmd = `lighthouse ${url} ${categoriesOptions} --quiet --output=json --output-path=${outputPath} ${chromeFlagsOptions} --max-wait-for-load=${maxWaitForLoad}`;

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error running Lighthouse for ${url}:`, stderr);
        reject(error);
      } else {
        console.log(`Lighthouse audit completed for ${url}`);
        resolve();
      }
    });
  });
};

app.get("/", (req, res) => {
  res.sendFile(path.resolve(rootPath, "public", "index.html"));
});

app.get("/runaudit", (req, res) => {
  res.send("Hello from runaudit");
});

/**
 * Analyzes accessibility issues with AI.
 * @param {string} issues - The accessibility issues to analyze.
 * @param {string} apiKey - The API key for the AI service.
 * @returns {!Promise<string>} - A promise that resolves with the AI analysis.
 */
const analyzeWithAI = async (issues, apiKey) => {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const prompt = `
      You are an expert UI/Accessibility engineer. Suggest specific HTML/CSS/ARIA fixes for the accessibility issues found.

      Return output ONLY in clean HTML using TailwindCSS classes.  
      Strictly follow this structure for every issue:

      <div class="issue-card">
        <p class="issue-title">[Serial No]: [Issue Title]</p>
        <p class="issue-solution">
          <span class="strong">Solution:</span> [Fix for the issue, ideally with updated HTML wrapped in <code class="code-block">...</code> blocks]
        </p>
      </div>

      Constraints:
      - Do NOT add any pre-text or explanation.
      - Only generate the HTML output for each issue in the above structure.
      - Wrap any code in <code> blocks with Tailwind styling as shown.
      - If not enough context, just return:  
      <div class="issue-card">
        <p class="issue-title error-text">[Serial No]: [Issue Title]</p>
        <p class="issue-solution warning-text">More context is needed for this issue.</p>
      </div>

      Issues:  
      ${issues}
      `;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `API Error: ${response.status} ${
          errorData.error?.message || response.statusText
        }`
      );
    }

    const data = await response.json();
    const result =
      data.candidates[0]?.content?.parts[0]?.text || "AI analysis failed.";
    return result.replace(/```html|```/g, "");
  } catch (error) {
    console.error("Error getting AI suggestions:", error);
    return "AI analysis failed.";
  }
};

app.post("/runaudit", async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { urls, apiKey } = req.body || testInputs;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Invalid input: urls" });
  }
  if (!apiKey) {
    return res.status(400).json({ error: "Invalid input: apiKey is required" });
  }

  const results = [];

  for (const url of urls) {
    const filename = url.replace(/https?:\/\//, "").replace(/\//g, "_");
    const jsonFile = path.join(outputDir, `${filename}.json`);
    await runLighthouse(url, { outputPath: jsonFile });

    const report = JSON.parse(fs.readFileSync(jsonFile, "utf-8"));
    const score = report.categories.accessibility?.score * 100 || 0;
    // if (score >= 90) continue;

    const issues = Object.values(report.audits)
      .filter((audit) => audit.score === 0)
      .map((audit) => ({
        id: audit.id,
        title: audit.title,
        description: audit.description,
        details:
          audit.details?.items?.map((item) => JSON.stringify(item, null, 2)) ||
          [],
      }));

    const issuesText = issues
      .map((issue, i) => {
        const serial = i + 1;
        const title = issue.title || "No title";
        const description = issue.description || "No description";

        let detailsText = "";

        if (issue.details?.items?.length) {
          const snippets = issue.details.items
            .map((item, j) => {
              // Try to get a meaningful snippet or stringify the item
              const snippet =
                item?.node?.snippet || JSON.stringify(item, null, 2);
              return `    [${j + 1}]: ${snippet}`;
            })
            .join("\n");

          detailsText = `\n  Details:\n${snippets}`;
        }

        return `[${serial}]: ${title} - ${description}${detailsText}`;
      })
      .join("\n\n");

    const aiFixes = await analyzeWithAI(issuesText, apiKey);
    console.log("AI fixes:", aiFixes);

    results.push({ url, score, issues: issuesText, aiFixes: aiFixes });
  }

  res.json({ results });
});

console.log("Tests");

app.listen(8080, () => {
  console.log("Server running at http://localhost:8080/");
});
