// Copyright (C) 2026 Phyxor Microsystems
// SPDX-FileContributor: Pablo Palazon
// SPDX-License-Identifier: BSD-3-Clause

(function () {
  "use strict";
  function closeOthers(current) {
    for (const dropdown of document.querySelectorAll(".site-nav-dropdown[open]")) {
      if (dropdown !== current) dropdown.open = false;
    }
  }
  document.addEventListener("click", event => {
    const dropdown = event.target.closest(".site-nav-dropdown");
    closeOthers(dropdown);
    if (dropdown && event.target.closest("a")) dropdown.open = false;
  });
  document.addEventListener("focusin", event => {
    closeOthers(event.target.closest(".site-nav-dropdown"));
  });
  document.addEventListener("keydown", event => {
    const dropdown = event.target.closest(".site-nav-dropdown");
    if (event.key === "Escape") {
      const open = dropdown?.open ? dropdown : document.querySelector(".site-nav-dropdown[open]");
      if (open) {
        event.preventDefault();
        open.open = false;
        open.querySelector("summary").focus();
      }
      return;
    }
    if (!dropdown) return;
    const links = [...dropdown.querySelectorAll("a")];
    if (!links.length) return;
    const summary = event.target.closest("summary");
    if (summary && ["Enter", " "].includes(event.key)) {
      event.preventDefault();
      closeOthers(dropdown);
      if (!event.repeat) dropdown.open = !dropdown.open;
    } else if (summary && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      closeOthers(dropdown);
      dropdown.open = true;
      (event.key === "ArrowDown" ? links[0] : links.at(-1)).focus();
    } else if (!summary && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const index = links.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
      links[next].focus();
    }
  });
})();
