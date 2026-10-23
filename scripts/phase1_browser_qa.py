#!/usr/bin/env python3
"""Exercise the running app through the real headless Chrome DevTools MCP."""

from datetime import datetime, timezone
from pathlib import Path
import json
import re
import sys
import time
from urllib.request import urlopen
from chrome_mcp import call

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "docs/phase1-browser-results.json"
checks = []


def tool(name, **arguments):
    result = call(name, {"pageId": 1, **arguments})
    if result.get("isError"):
        raise RuntimeError(json.dumps(result))
    return "\n".join(item.get("text", "") for item in result.get("content", []) if item.get("type") == "text")


def evaluate(source):
    output = tool("evaluate_script", function=source)
    match = re.search(r"```json\s*(.*?)\s*```", output, re.S)
    if not match:
        raise RuntimeError(output)
    return json.loads(match.group(1))


def wait_for(expression):
    return evaluate("async () => { const end=performance.now()+2000; do { if (" + expression + ") return true; await new Promise(requestAnimationFrame); } while(performance.now()<end); return false; }")


def uid(role, name):
    snapshot = tool("take_snapshot")
    match = re.search(r"uid=([\d_]+) " + re.escape(role) + r' "' + re.escape(name) + '"', snapshot)
    if not match:
        raise AssertionError(f"Missing accessible {role}: {name}\n{snapshot}")
    return match.group(1)


def click(role, name):
    tool("click", uid=uid(role, name))


def fill(value):
    tool("fill", uid=uid("searchbox", "Search inspiration"), value=value)


def check(name, condition, evidence=None):
    checks.append({"check": name, "passed": bool(condition), "evidence": evidence})
    REPORT.write_text(json.dumps({"tested_at": datetime.now(timezone.utc).isoformat(), "tool": "Chrome DevTools MCP / headless Chrome", "url": "http://localhost:3000", "checks": checks}, indent=2) + "\n")
    print(json.dumps({"check": name, "passed": bool(condition)}), flush=True)
    if not condition:
        raise AssertionError(name)


def count():
    return evaluate("() => ({count:document.querySelectorAll('.inspiration-trigger').length,status:document.querySelector('[role=status]').textContent})")


def screenshot(name, full=True):
    evaluate("async () => { await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))); return true; }")
    tool("take_screenshot", filePath=str(ROOT / "docs/screenshots" / name), fullPage=full)


def layout():
    return evaluate("""async () => {
      await document.fonts.ready;
      await Promise.race([Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))),new Promise(r=>setTimeout(r,10000))]);
      const side=document.querySelector('.desktop-sidebar');
      const heading=getComputedStyle(document.querySelector('h1'));
      return {viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>innerWidth,
        sidebar:getComputedStyle(side).display==='none'?0:side.getBoundingClientRect().width,
        topbar:document.querySelector('.topbar').getBoundingClientRect().height,
        padding:parseFloat(getComputedStyle(document.querySelector('.page-content')).paddingLeft),
        headline:[heading.fontSize,heading.lineHeight],
        imageCount:document.images.length,badImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.alt),
        columns:getComputedStyle(document.querySelector('.inspiration-grid')).gridTemplateColumns.split(' ').length,
        background:getComputedStyle(document.body).backgroundColor,
        disabled:[...document.querySelectorAll('.desktop-sidebar .nav-item:disabled')].map(i=>i.getAttribute('aria-label')),
        futureLinks:[...document.querySelectorAll('a')].filter(a=>/image-studio|cinematic-studio|my-assets|brand-dna/.test(a.getAttribute('href')||'')).length};
    }""")


def run():
    deadline = time.monotonic() + 30
    while True:
        try:
            with urlopen("http://localhost:3000", timeout=3) as response:
                if response.status == 200 and "editorial-hero" in response.read().decode():
                    break
        except OSError:
            pass
        if time.monotonic() > deadline:
            raise RuntimeError("The production app did not become ready at localhost:3000")
        time.sleep(0.1)
    for width, height in [(1440, 900), (1024, 768), (768, 1024), (390, 844)]:
        label = f"{width}x{height}"
        tool("emulate", viewport=f"{width}x{height}x1" + (",mobile,touch" if width < 1024 else ""), prefersReducedMotion="no-preference")
        tool("navigate_page", url="http://localhost:3000", timeout=120000)
        tool("wait_for", text=["Curated inspiration"], visible=True, timeout=15000)
        dimensions = layout()
        check(f"{label}: dimensions, typography, assets and overflow", dimensions["viewport"] == [width, height] and not dimensions["overflow"] and dimensions["sidebar"] == (252 if width >= 1024 else 0) and dimensions["topbar"] == 64 and dimensions["padding"] == (32 if width >= 1024 else 24 if width >= 640 else 16) and dimensions["headline"] == (["36px", "42px"] if width >= 640 else ["28px", "34px"]) and not dimensions["badImages"] and dimensions["imageCount"] == 9 and dimensions["futureLinks"] == 0, dimensions)
        screenshot(f"explore-{label}.png")

        if width >= 1024:
            click("button", "Collapse sidebar")
            collapsed = evaluate("async () => {await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));return {width:document.querySelector('.desktop-sidebar').getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth,expanded:document.querySelector('[aria-controls=desktop-navigation]').getAttribute('aria-expanded')}}")
            check(f"{label}: collapse navigation", collapsed == {"width": 72, "overflow": False, "expanded": "false"}, collapsed)
            if width == 1440:
                screenshot("navigation-collapsed.png", False)
            click("button", "Expand sidebar")
            check(f"{label}: expand navigation", wait_for("document.querySelector('.desktop-sidebar').getBoundingClientRect().width===252"))
        else:
            click("button", "Open navigation")
            drawer = evaluate("() => {const d=document.querySelector('[data-slot=sheet-content]');return {width:d.getBoundingClientRect().width,focus:d.contains(document.activeElement),groups:[...d.querySelectorAll('.nav-group-title')].map(e=>e.textContent),disabled:d.querySelectorAll('button:disabled').length}}")
            check(f"{label}: grouped mobile drawer", drawer == {"width": 280, "focus": True, "groups": ["Discover", "Create", "Workspace"], "disabled": 4}, drawer)
            if width == 390:
                screenshot("mobile-navigation.png", False)
            for _ in range(4):
                tool("press_key", key="Tab")
                check(f"{label}: drawer keeps keyboard focus", evaluate("() => document.querySelector('[data-slot=sheet-content]').contains(document.activeElement)"))
            tool("press_key", key="Escape")
            check(f"{label}: drawer closes and restores focus", wait_for("!document.querySelector('[data-slot=sheet-content]') && document.activeElement.getAttribute('aria-label')==='Open navigation'"))

        fill("  PERFUME  ")
        check(f"{label}: search finds a direction", count()["count"] == 1, count())
        click("button", "Product")
        check(f"{label}: search and category combine", count()["count"] == 1 and evaluate("() => document.querySelector('.inspiration-trigger').getAttribute('aria-label')") == "Preview Quiet luxury")
        fill("desert")
        check(f"{label}: no results", count()["count"] == 0 and evaluate("() => document.querySelector('.empty-state h3').textContent") == "No directions found", count())
        if width == 1440:
            screenshot("no-results.png", False)
        click("button", "Clear search & filters")
        check(f"{label}: reset restores collection", count()["count"] == 8 and evaluate("() => document.querySelector('#inspiration-search').value") == "", count())

        click("button", "Preview Dune studies")
        preview = evaluate("() => {const d=document.querySelector('[role=dialog]'),f=document.activeElement.getBoundingClientRect(),b=d.getBoundingClientRect();return {title:d.querySelector('[data-slot=dialog-title]').textContent,labels:[...d.querySelectorAll('dt')].map(e=>e.textContent),focus:d.contains(document.activeElement),focusVisible:f.top>=b.top&&f.bottom<=b.bottom&&f.left>=b.left&&f.right<=b.right,described:!!d.getAttribute('aria-describedby'),overflow:document.documentElement.scrollWidth>innerWidth}}")
        check(f"{label}: accessible preview opens", preview == {"title": "Dune studies", "labels": ["Light & mood", "Composition", "Color story"], "focus": True, "focusVisible": True, "described": True, "overflow": False}, preview)
        if width in [1440, 390]:
            screenshot(f"preview-{label}.png", False)
        for _ in range(3):
            tool("press_key", key="Tab")
            check(f"{label}: preview traps keyboard focus", evaluate("() => document.querySelector('[role=dialog]').contains(document.activeElement)"))
        tool("press_key", key="Escape")
        check(f"{label}: Escape closes preview and restores focus", wait_for("!document.querySelector('[role=dialog]') && document.activeElement.getAttribute('aria-label')==='Preview Dune studies'"))

        console = tool("list_console_messages", types=["error", "warn"])
        network = tool("list_network_requests")
        check(f"{label}: no console warnings/errors", "<no console messages found>" in console.lower() or "0 messages" in console.lower() or "No console messages" in console, console)
        check(f"{label}: no failed network requests", not re.search(r"failed|status: [45]\d\d", network, re.I), network)

    tool("emulate", viewport="1440x900x1", prefersReducedMotion="reduce")
    tool("navigate_page", url="http://localhost:3000")
    tool("wait_for", text=["Curated inspiration"], visible=True, timeout=15000)
    click("button", "Preview Quiet luxury")
    click("button", "Close")
    check("Close button dismisses preview and restores focus", wait_for("!document.querySelector('[role=dialog]') && document.activeElement.getAttribute('aria-label')==='Preview Quiet luxury'"))
    tool("press_key", key="Enter")
    check("Keyboard Enter opens a preview", evaluate("() => !!document.querySelector('[role=dialog]')"))
    tool("press_key", key="Escape")
    motion = evaluate("() => ({reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,scroll:getComputedStyle(document.documentElement).scrollBehavior,duration:getComputedStyle(document.querySelector('.workspace-shell')).transitionDuration})")
    check("Reduced motion is respected", motion["reduced"] and motion["scroll"] == "auto" and float(motion["duration"].removesuffix("s")) < 0.001, motion)
    tool("press_key", key="Tab")
    focus = evaluate("() => ({width:getComputedStyle(document.activeElement).outlineWidth,style:getComputedStyle(document.activeElement).outlineStyle})")
    check("Keyboard focus is visible", focus == {"width": "2px", "style": "solid"}, focus)
    tool("emulate", viewport="1440x900x1", prefersReducedMotion="no-preference")
    tool("navigate_page", url="http://localhost:3000")
    tool("wait_for", text=["Curated inspiration"], visible=True, timeout=15000)
    print(json.dumps({"passed": len(checks), "report": str(REPORT)}), flush=True)


if __name__ == "__main__":
    if sys.argv[1:] == ["inspect"]:
        diagnostic = evaluate("() => {const i=document.querySelector('.hero-art img');return {image:{currentSrc:i.currentSrc,loading:i.loading,fetchPriority:i.fetchPriority,sizes:i.sizes},preloads:[...document.querySelectorAll('link[rel=preload][as=image]')].map(l=>({href:l.href,sizes:l.imageSizes,srcset:l.imageSrcset,priority:l.fetchPriority})),imageTiming:performance.getEntriesByType('resource').filter(r=>r.name.includes('/_next/image')).map(r=>({name:r.name,initiator:r.initiatorType,bytes:r.transferSize}))}}")
        print(json.dumps(diagnostic, indent=2))
    else:
        run()
