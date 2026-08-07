(function initJiraWikiConverter(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.JiraWikiConverter = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function buildConverter() {
  "use strict";

  const VERSION = "1.0.0";
  const DEFAULT_OPTIONS = Object.freeze({
    convertImages: true,
  });

  const LANGUAGE_ALIASES = Object.freeze({
    bash: "bash",
    shell: "bash",
    sh: "bash",
    zsh: "bash",
    csharp: "c#",
    cs: "c#",
    cpp: "c++",
    cxx: "c++",
    html: "html",
    js: "javascript",
    javascript: "javascript",
    json: "javascript",
    jsx: "javascript",
    md: "none",
    markdown: "none",
    py: "python",
    python: "python",
    sql: "sql",
    text: "none",
    txt: "none",
    ts: "javascript",
    tsx: "javascript",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
  });

  function normalizeInput(markdown) {
    return String(markdown == null ? "" : markdown)
      .replace(/\r\n?/g, "\n")
      .replace(/^\uFEFF/, "");
  }

  function countIndent(indent) {
    let width = 0;
    for (const character of indent) {
      width += character === "\t" ? 4 : 1;
    }
    return width;
  }

  function normalizeLanguage(infoString) {
    const raw = String(infoString || "")
      .trim()
      .split(/\s+/)[0]
      .replace(/^\{\.?/, "")
      .replace(/\}$/, "")
      .toLowerCase();

    if (!raw) {
      return "";
    }

    const normalized = LANGUAGE_ALIASES[raw] || raw;
    return /^[a-z0-9#+._-]+$/i.test(normalized) ? normalized : "";
  }

  function escapeImageAttribute(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/!/g, "\\!")
      .replace(/,/g, "\\,")
      .replace(/\|/g, "\\|")
      .trim();
  }

  function escapeInlineCode(value) {
    return String(value || "")
      .replace(/\}\}/g, "\\}\\}")
      .replace(/\r?\n/g, " ");
  }

  function createTokenStore() {
    const values = [];
    return {
      stash(value) {
        const index = values.push(value) - 1;
        return `\uE000MD2JIRA${index}\uE001`;
      },
      restore(text) {
        let restored = text;
        let previous;
        do {
          previous = restored;
          restored = restored.replace(/\uE000MD2JIRA(\d+)\uE001/g, function restoreToken(_match, index) {
            return values[Number(index)];
          });
        } while (restored !== previous);
        return restored;
      },
    };
  }

  function convertInline(input, options) {
    const tokenStore = createTokenStore();
    let text = String(input == null ? "" : input);

    // Preserve explicitly escaped Markdown punctuation before applying formatting rules.
    text = text.replace(/\\([\\`*_{}\[\]()#+.!|>~-])/g, function preserveEscape(_match, character) {
      return tokenStore.stash(`\\${character}`);
    });

    // Markdown hard breaks and basic HTML line breaks.
    text = text.replace(/<br\s*\/?\s*>/gi, "\\\\");
    text = text.replace(/ {2,}$/, " \\\\");

    // Inline code must be protected before emphasis and link conversion.
    text = text.replace(/(`+)([\s\S]*?)\1/g, function convertCodeSpan(_match, _ticks, body) {
      return tokenStore.stash(`{{${escapeInlineCode(body)}}}`);
    });

    if (options.convertImages) {
      text = text.replace(
        /!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["']([^"']*)["'])?\s*\)/g,
        function convertImage(_match, altText, angleUrl, plainUrl, title) {
          const url = angleUrl || plainUrl;
          const attributes = [];
          const alt = escapeImageAttribute(altText);
          const safeTitle = escapeImageAttribute(title);
          if (alt) {
            attributes.push(`alt=${alt}`);
          }
          if (safeTitle) {
            attributes.push(`title=${safeTitle}`);
          }
          const suffix = attributes.length ? `|${attributes.join(",")}` : "";
          return tokenStore.stash(`!${url}${suffix}!`);
        }
      );
    }

    // Inline links, including optional Markdown titles.
    text = text.replace(
      /\[([^\]]+)\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g,
      function convertLink(_match, label, angleUrl, plainUrl) {
        const url = angleUrl || plainUrl;
        return tokenStore.stash(`[${label}|${url}]`);
      }
    );

    text = text.replace(/<((?:https?:\/\/|mailto:)[^>]+)>/gi, function convertAutolink(_match, url) {
      return tokenStore.stash(`[${url}]`);
    });

    // Apply combined emphasis before the individual rules. Converted spans are
    // protected so Jira's strong markers are not re-read as Markdown italics.
    text = text.replace(/\*\*\*([^*\n]+?)\*\*\*/g, function convertBoldItalic(_match, body) {
      return tokenStore.stash(`_*${body}*_`);
    });
    text = text.replace(/___([^_\n]+?)___/g, function convertUnderscoreBoldItalic(_match, body) {
      return tokenStore.stash(`_*${body}*_`);
    });
    text = text.replace(/\*\*([^*\n]+?)\*\*/g, function convertBold(_match, body) {
      return tokenStore.stash(`*${body}*`);
    });
    text = text.replace(/__([^_\n]+?)__/g, function convertUnderscoreBold(_match, body) {
      return tokenStore.stash(`*${body}*`);
    });
    text = text.replace(/~~([^~\n]+?)~~/g, function convertStrike(_match, body) {
      return tokenStore.stash(`-${body}-`);
    });

    // Asterisks and underscores used for emphasis. Boundary checks avoid most
    // false positives in identifiers such as snake_case and multiplication.
    text = text.replace(/(^|[^\w])\*([^*\n]+?)\*(?=$|[^\w])/g, function convertAsteriskItalic(_match, prefix, body) {
      return `${prefix}${tokenStore.stash(`_${body}_`)}`;
    });
    text = text.replace(/(^|[^\w])_([^_\n]+?)_(?=$|[^\w])/g, function convertUnderscoreItalic(_match, prefix, body) {
      return `${prefix}${tokenStore.stash(`_${body}_`)}`;
    });

    return tokenStore.restore(text);
  }

  function splitTableRow(line) {
    let value = String(line || "").trim();
    if (value.startsWith("|")) {
      value = value.slice(1);
    }
    if (value.endsWith("|") && !value.endsWith("\\|")) {
      value = value.slice(0, -1);
    }

    const cells = [];
    let current = "";
    let escaped = false;
    let inlineTicks = 0;

    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];

      if (escaped) {
        current += character === "|" ? "\\|" : `\\${character}`;
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === "`") {
        let runLength = 1;
        while (value[index + runLength] === "`") {
          runLength += 1;
        }
        if (inlineTicks === 0) {
          inlineTicks = runLength;
        } else if (inlineTicks === runLength) {
          inlineTicks = 0;
        }
        current += "`".repeat(runLength);
        index += runLength - 1;
        continue;
      }

      if (character === "|" && inlineTicks === 0) {
        cells.push(current.trim());
        current = "";
        continue;
      }

      current += character;
    }

    if (escaped) {
      current += "\\";
    }
    cells.push(current.trim());
    return cells;
  }

  function isTableDelimiter(line) {
    if (!String(line || "").includes("|")) {
      return false;
    }
    const cells = splitTableRow(line);
    return cells.length > 0 && cells.every(function delimiterCell(cell) {
      return /^:?-{3,}:?$/.test(cell.trim());
    });
  }

  function isTableHeader(lines, index) {
    if (index + 1 >= lines.length) {
      return false;
    }
    const header = lines[index];
    return header.includes("|") && isTableDelimiter(lines[index + 1]);
  }

  function convertTable(lines, startIndex, options) {
    const output = [];
    const headerCells = splitTableRow(lines[startIndex]).map(function convertHeaderCell(cell) {
      return convertInline(cell, options);
    });
    output.push(`||${headerCells.join("||")}||`);

    let index = startIndex + 2;
    for (; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.trim() || !line.includes("|")) {
        break;
      }
      const cells = splitTableRow(line).map(function convertBodyCell(cell) {
        return convertInline(cell, options);
      });
      output.push(`|${cells.join("|")}|`);
    }

    return { output, nextIndex: index - 1 };
  }

  function extractReferenceLinks(lines) {
    const references = Object.create(null);
    const filtered = [];

    for (const line of lines) {
      const match = line.match(/^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))(?:\s+["'(].*?["')])?\s*$/);
      if (!match) {
        filtered.push(line);
        continue;
      }
      references[match[1].trim().toLowerCase()] = match[2] || match[3];
    }

    return { lines: filtered, references };
  }

  function applyReferenceLinks(text, references) {
    let output = text;

    output = output.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, function fullReference(_match, label, referenceName) {
      const key = (referenceName || label).trim().toLowerCase();
      const url = references[key];
      return url ? `[${label}](${url})` : _match;
    });

    output = output.replace(/(^|[^!])\[([^\]]+)\](?![\[(])/g, function shortcutReference(match, prefix, label) {
      const url = references[label.trim().toLowerCase()];
      return url ? `${prefix}[${label}](${url})` : match;
    });

    return output;
  }

  function markdownToJira(markdown, suppliedOptions) {
    const options = Object.assign({}, DEFAULT_OPTIONS, suppliedOptions || {});
    const normalized = normalizeInput(markdown);
    const extracted = extractReferenceLinks(normalized.split("\n"));
    const lines = extracted.lines;
    const references = extracted.references;
    const output = [];

    let inFence = false;
    let fenceCharacter = "";
    let fenceLength = 0;
    let quoteOpen = false;
    let listLevels = [];

    function closeQuote() {
      if (quoteOpen) {
        output.push("{quote}");
        quoteOpen = false;
      }
    }

    for (let index = 0; index < lines.length; index += 1) {
      const rawLine = lines[index];
      const line = applyReferenceLinks(rawLine, references);

      if (inFence) {
        const closingPattern = new RegExp(`^\\s*${fenceCharacter}{${fenceLength},}\\s*$`);
        if (closingPattern.test(line)) {
          output.push("{code}");
          inFence = false;
          fenceCharacter = "";
          fenceLength = 0;
        } else {
          output.push(rawLine);
        }
        continue;
      }

      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})\s*([^`]*)$/);
      if (fenceMatch) {
        closeQuote();
        listLevels = [];
        fenceCharacter = fenceMatch[1][0];
        fenceLength = fenceMatch[1].length;
        const language = normalizeLanguage(fenceMatch[2]);
        output.push(language && language !== "none" ? `{code:${language}}` : "{code}");
        inFence = true;
        continue;
      }

      if (isTableHeader(lines, index)) {
        closeQuote();
        listLevels = [];
        const table = convertTable(lines, index, options);
        output.push.apply(output, table.output);
        index = table.nextIndex;
        continue;
      }

      // Setext headings are checked before horizontal rules.
      if (
        line.trim() &&
        index + 1 < lines.length &&
        /^\s*(=+|-+)\s*$/.test(lines[index + 1]) &&
        lines[index + 1].trim().length >= 3
      ) {
        closeQuote();
        listLevels = [];
        const level = lines[index + 1].trim().startsWith("=") ? 1 : 2;
        output.push(`h${level}. ${convertInline(line.trim(), options)}`);
        index += 1;
        continue;
      }

      if (/^\s*$/.test(line)) {
        closeQuote();
        listLevels = [];
        output.push("");
        continue;
      }

      const quoteMatch = line.match(/^\s{0,3}>\s?(.*)$/);
      if (quoteMatch) {
        if (!quoteOpen) {
          output.push("{quote}");
          quoteOpen = true;
        }
        listLevels = [];
        output.push(convertInline(quoteMatch[1], options));
        continue;
      }

      closeQuote();

      const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (headingMatch) {
        listLevels = [];
        output.push(`h${headingMatch[1].length}. ${convertInline(headingMatch[2], options)}`);
        continue;
      }

      if (/^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})\s*$/.test(line)) {
        listLevels = [];
        output.push("----");
        continue;
      }

      const listMatch = line.match(/^(\s*)([-+*]|\d+[.)])\s+(.+)$/);
      if (listMatch) {
        const indentWidth = countIndent(listMatch[1]);
        const marker = /^\d/.test(listMatch[2]) ? "#" : "*";

        // Markdown accepts different indentation conventions (commonly two or
        // four spaces, or tabs). Track the indentation values that actually
        // occur instead of assuming a fixed width for every nesting level.
        const exactLevel = listLevels.findIndex(function findIndent(level) {
          return level.indent === indentWidth;
        });

        if (exactLevel >= 0) {
          listLevels = listLevels.slice(0, exactLevel + 1);
          listLevels[exactLevel] = { indent: indentWidth, marker };
        } else if (!listLevels.length) {
          listLevels = [{ indent: indentWidth, marker }];
        } else if (indentWidth > listLevels[listLevels.length - 1].indent) {
          listLevels.push({ indent: indentWidth, marker });
        } else {
          let parentLevel = -1;
          for (let levelIndex = 0; levelIndex < listLevels.length; levelIndex += 1) {
            if (listLevels[levelIndex].indent < indentWidth) {
              parentLevel = levelIndex;
            } else {
              break;
            }
          }
          listLevels = listLevels.slice(0, parentLevel + 1);
          listLevels.push({ indent: indentWidth, marker });
        }

        let itemText = listMatch[3];
        const taskMatch = itemText.match(/^\[([ xX])\]\s+(.*)$/);
        if (taskMatch) {
          itemText = `${taskMatch[1].toLowerCase() === "x" ? "☑" : "☐"} ${taskMatch[2]}`;
        }

        const jiraPrefix = listLevels.map(function listMarker(level) {
          return level.marker;
        }).join("");
        output.push(`${jiraPrefix} ${convertInline(itemText, options)}`);
        continue;
      }

      listLevels = [];

      // Indented Markdown code blocks. A blank line before the block prevents
      // ordinary nested prose from being treated as code.
      if (
        /^(?: {4}|\t)/.test(rawLine) &&
        (index === 0 || /^\s*$/.test(lines[index - 1]))
      ) {
        output.push("{noformat}");
        let codeIndex = index;
        for (; codeIndex < lines.length; codeIndex += 1) {
          const codeLine = lines[codeIndex];
          if (/^(?: {4}|\t)/.test(codeLine)) {
            output.push(codeLine.replace(/^(?: {4}|\t)/, ""));
            continue;
          }
          if (/^\s*$/.test(codeLine)) {
            output.push("");
            continue;
          }
          break;
        }
        output.push("{noformat}");
        index = codeIndex - 1;
        continue;
      }

      output.push(convertInline(line, options));
    }

    if (inFence) {
      output.push("{code}");
    }
    closeQuote();

    // Preserve meaningful internal spacing while avoiding accidental blank
    // lines at the beginning or end of pasted content.
    while (output.length && output[0] === "") {
      output.shift();
    }
    while (output.length && output[output.length - 1] === "") {
      output.pop();
    }

    return output.join("\n");
  }

  return Object.freeze({
    VERSION,
    markdownToJira,
  });
});
