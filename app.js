(function initApplication() {
  "use strict";

  const PROTOCOL = "md2jira/v1";
  const SAMPLE_MARKDOWN = [
    "# Release summary",
    "",
    "**Status:** Ready for review",
    "",
    "## Changes",
    "",
    "- Added event-driven processing",
    "- Removed the legacy trigger",
    "- Preserved `message.id` in every run",
    "",
    "| Check | Result |",
    "|---|---|",
    "| Unit tests | **Passed** |",
    "| Rollback | Documented |",
    "",
    "```python",
    "print(\"ready\")",
    "```",
    "",
    "[Open the runbook](https://example.com/runbook)",
  ].join("\n");

  const converter = window.JiraWikiConverter;
  if (!converter || typeof converter.markdownToJira !== "function") {
    document.body.textContent = "Converter failed to load.";
    return;
  }

  const elements = {
    body: document.body,
    form: document.getElementById("converter-form"),
    input: document.getElementById("markdown-input"),
    output: document.getElementById("jira-output"),
    inputCounter: document.getElementById("input-counter"),
    outputCounter: document.getElementById("output-counter"),
    pasteButton: document.getElementById("paste-button"),
    sampleButton: document.getElementById("sample-button"),
    clearButton: document.getElementById("clear-button"),
    downloadButton: document.getElementById("download-button"),
    copyButton: document.getElementById("copy-button"),
    inputCard: document.querySelector(".input-card"),
    dropZone: document.getElementById("drop-zone"),
    toast: document.getElementById("toast"),
  };

  const params = new URLSearchParams(window.location.search);
  const embedMode = params.get("embed") === "1" || params.get("embed") === "true";
  const emitChangeEvents = params.get("events") === "1" || params.get("events") === "true";
  const requestedTheme = params.get("theme");

  if (embedMode) {
    elements.body.classList.add("embed-mode");
  }
  if (requestedTheme === "light" || requestedTheme === "dark") {
    document.documentElement.dataset.theme = requestedTheme;
  }

  let toastTimer = 0;
  let dragDepth = 0;
  let lastOutput = "";

  function pluralizedCharacters(value) {
    const count = value.length;
    return `${count.toLocaleString()} character${count === 1 ? "" : "s"}`;
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(function hideToast() {
      elements.toast.classList.remove("is-visible");
    }, 1800);
  }

  function postToParent(payload, targetOrigin) {
    if (window.parent === window) {
      return;
    }
    window.parent.postMessage(
      Object.assign({ protocol: PROTOCOL }, payload),
      targetOrigin || "*"
    );
  }

  function scheduleHeightMessage() {
    window.requestAnimationFrame(function reportHeight() {
      postToParent({
        type: "md2jira:resize",
        height: Math.ceil(document.documentElement.scrollHeight),
      });
    });
  }

  function updateUi(options) {
    const settings = Object.assign({ notifyParent: true }, options || {});
    const markdown = elements.input.value;
    const output = converter.markdownToJira(markdown);
    const hasInput = markdown.length > 0;
    const hasOutput = output.length > 0;

    elements.output.value = output;
    elements.inputCounter.textContent = pluralizedCharacters(markdown);
    elements.outputCounter.textContent = pluralizedCharacters(output);
    elements.clearButton.disabled = !hasInput;
    elements.copyButton.disabled = !hasOutput;
    elements.downloadButton.disabled = !hasOutput;

    if (settings.notifyParent && emitChangeEvents && output !== lastOutput) {
      postToParent({
        type: "md2jira:changed",
        markdown,
        jiraWiki: output,
      });
    }
    lastOutput = output;
    scheduleHeightMessage();
    return output;
  }

  function selectOutput() {
    elements.output.focus({ preventScroll: true });
    elements.output.select();
    elements.output.setSelectionRange(0, elements.output.value.length);
  }

  async function copyOutput() {
    const output = updateUi();
    if (!output) {
      elements.input.focus();
      showToast("Paste Markdown first");
      return false;
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(output);
      } else {
        throw new Error("Clipboard API unavailable");
      }
      showToast("Jira wiki copied");
      return true;
    } catch (_error) {
      selectOutput();
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (_ignored) {
        copied = false;
      }

      if (copied) {
        showToast("Jira wiki copied");
        elements.input.focus({ preventScroll: true });
        return true;
      }

      showToast("Output selected. Press Ctrl/⌘ + C");
      return false;
    }
  }

  async function pasteFromClipboard() {
    try {
      if (!navigator.clipboard || !window.isSecureContext) {
        throw new Error("Clipboard API unavailable");
      }
      const value = await navigator.clipboard.readText();
      elements.input.value = value;
      updateUi();
      elements.input.focus();
      showToast(value ? "Markdown pasted" : "Clipboard is empty");
    } catch (_error) {
      elements.input.focus();
      showToast("Press Ctrl/⌘ + V to paste");
    }
  }

  function downloadOutput() {
    const output = updateUi();
    if (!output) {
      return;
    }
    const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "jira-wiki.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("jira-wiki.txt downloaded");
  }

  function clearInput() {
    elements.input.value = "";
    updateUi();
    elements.input.focus();
  }

  function loadSample() {
    elements.input.value = SAMPLE_MARKDOWN;
    updateUi();
    elements.input.focus();
    elements.input.setSelectionRange(0, 0);
  }

  function readDroppedFile(file) {
    if (!file) {
      return;
    }
    const looksLikeMarkdown = /\.(md|markdown|mdown|mkd|txt)$/i.test(file.name) || file.type.startsWith("text/");
    if (!looksLikeMarkdown) {
      showToast("Drop a Markdown or text file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("File is larger than 5 MB");
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", function onFileLoaded() {
      elements.input.value = String(reader.result || "");
      updateUi();
      elements.input.focus();
      showToast(`${file.name} loaded`);
    });
    reader.addEventListener("error", function onFileError() {
      showToast("Could not read that file");
    });
    reader.readAsText(file);
  }

  elements.input.addEventListener("input", function onInput() {
    updateUi();
  });

  elements.form.addEventListener("submit", function onSubmit(event) {
    event.preventDefault();
    void copyOutput();
  });

  elements.pasteButton.addEventListener("click", function onPaste() {
    void pasteFromClipboard();
  });
  elements.sampleButton.addEventListener("click", loadSample);
  elements.clearButton.addEventListener("click", clearInput);
  elements.downloadButton.addEventListener("click", downloadOutput);

  elements.input.addEventListener("keydown", function onShortcut(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void copyOutput();
    }
  });

  elements.dropZone.addEventListener("dragenter", function onDragEnter(event) {
    event.preventDefault();
    dragDepth += 1;
    elements.inputCard.classList.add("is-dragging");
  });

  elements.dropZone.addEventListener("dragover", function onDragOver(event) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  });

  elements.dropZone.addEventListener("dragleave", function onDragLeave(event) {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      elements.inputCard.classList.remove("is-dragging");
    }
  });

  elements.dropZone.addEventListener("drop", function onDrop(event) {
    event.preventDefault();
    dragDepth = 0;
    elements.inputCard.classList.remove("is-dragging");
    readDroppedFile(event.dataTransfer && event.dataTransfer.files[0]);
  });

  window.addEventListener("message", function onMessage(event) {
    if (event.source !== window.parent) {
      return;
    }
    const data = event.data;
    if (!data || typeof data !== "object") {
      return;
    }
    if (data.protocol && data.protocol !== PROTOCOL) {
      return;
    }
    if (data.type !== "md2jira:convert" && data.type !== "md2jira:set") {
      return;
    }

    const markdown = typeof data.markdown === "string" ? data.markdown : "";
    elements.input.value = markdown;
    const jiraWiki = updateUi({ notifyParent: false });
    const targetOrigin = event.origin && event.origin !== "null" ? event.origin : "*";

    if (event.source && typeof event.source.postMessage === "function") {
      event.source.postMessage(
        {
          protocol: PROTOCOL,
          type: "md2jira:result",
          requestId: data.requestId == null ? null : data.requestId,
          markdown,
          jiraWiki,
        },
        targetOrigin
      );
    }
  });

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(scheduleHeightMessage);
    observer.observe(document.documentElement);
  }

  updateUi({ notifyParent: false });
  postToParent({
    type: "md2jira:ready",
    version: converter.VERSION,
  });

  if (params.get("autofocus") !== "0") {
    elements.input.focus({ preventScroll: true });
  }
})();
