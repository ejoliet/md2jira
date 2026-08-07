(function initEmbedExample() {
  "use strict";

  const PROTOCOL = "md2jira/v1";
  const frame = document.getElementById("converter-frame");
  const form = document.getElementById("host-form");
  const markdown = document.getElementById("host-markdown");
  const result = document.getElementById("host-result");
  let requestSequence = 0;

  function convert() {
    requestSequence += 1;
    frame.contentWindow.postMessage(
      {
        protocol: PROTOCOL,
        type: "md2jira:convert",
        requestId: requestSequence,
        markdown: markdown.value,
      },
      "*"
    );
  }

  form.addEventListener("submit", function onSubmit(event) {
    event.preventDefault();
    convert();
  });

  window.addEventListener("message", function onMessage(event) {
    if (event.source !== frame.contentWindow) {
      return;
    }
    const data = event.data;
    if (!data || data.protocol !== PROTOCOL) {
      return;
    }
    if (data.type === "md2jira:ready") {
      convert();
      return;
    }
    if (data.type === "md2jira:result") {
      result.textContent = data.jiraWiki;
      return;
    }
    if (data.type === "md2jira:resize" && Number.isFinite(data.height)) {
      frame.style.height = `${Math.max(620, data.height)}px`;
    }
  });
})();
