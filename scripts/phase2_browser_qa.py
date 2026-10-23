#!/usr/bin/env python3
"""Targeted real Chrome DevTools QA. --journey spends three small generations.

Run --layout first; --journey once after it passes. No response image bytes or
credentials are written into the report. Generated files remain local downloads.
"""
from datetime import datetime, timezone
from pathlib import Path
import json
import re
import sys
from chrome_mcp import call

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "docs/phase2-browser-results.json"
PAGE = 2
report = json.loads(REPORT.read_text()) if REPORT.exists() else {"tool": "real Chrome DevTools MCP / headless Chrome", "checks": []}

def tool(name, **args):
    result = call(name, {"pageId": PAGE, **args})
    if result.get("isError"):
        raise RuntimeError(str(result)[:1500])
    return "\n".join(c.get("text", "") for c in result.get("content", []) if c.get("type") == "text")

def evaluate(source):
    text = tool("evaluate_script", function=source)
    match = re.search(r"```json\s*(.*?)\s*```", text, re.S)
    if not match:
        raise RuntimeError(text[:1500])
    return json.loads(match.group(1))

def check(name, passed, evidence=None):
    item = {"check": name, "passed": bool(passed), "evidence": evidence}
    report["checks"] = [c for c in report["checks"] if c["check"] != name] + [item]
    report["tested_at"] = datetime.now(timezone.utc).isoformat()
    REPORT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"check": name, "passed": bool(passed)}), flush=True)
    if not passed:
        raise AssertionError(name)

def uid(role, name):
    snapshot = tool("take_snapshot")
    match = re.search(r"uid=([\d_]+) " + re.escape(role) + ' "' + re.escape(name) + '"', snapshot)
    if not match:
        raise AssertionError(f"Missing {role} {name}: " + snapshot[:3500])
    return match.group(1)

def click(role, name):
    return tool("click", uid=uid(role, name))

def prompt(text):
    # Chrome's fill currently mutates this controlled textarea without React's
    # input event. Keyboard input exercises the actual user path.
    click("textbox", "Your idea Required")
    tool("press_key", key="Control+A")
    tool("type_text", text=text)

def wait(expression, timeout=4000):
    return evaluate("async () => { const end=performance.now()+" + str(timeout) + "; do { if (" + expression + ") return true; await new Promise(requestAnimationFrame); } while(performance.now()<end); return false; }")

def shot(name, full=False):
    tool("take_screenshot", filePath=str(ROOT / "docs/screenshots" / name), fullPage=full)

def layout():
    tool("navigate_page", url="http://localhost:3000/image-studio")
    tool("wait_for", text=["Room for your next idea."], visible=True, timeout=15000)
    for w, h in [(1440,900),(1024,768),(768,1024),(390,844)]:
        label = f"{w}x{h}"
        tool("emulate", viewport=f"{w}x{h}x1" + (",mobile,touch" if w < 1024 else ""))
        evaluate("async () => { await document.fonts.ready; await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))); scrollTo(0,0); return true; }")
        data = evaluate("""() => {const c=document.querySelector('.studio-controls'),s=document.querySelector('.desktop-sidebar'),g=document.querySelector('.generate-button');return {overflow:document.documentElement.scrollWidth>innerWidth,rail:getComputedStyle(s).display==='none'?0:s.getBoundingClientRect().width,controls:c.getBoundingClientRect().width,layout:getComputedStyle(document.querySelector('.studio-page')).display,generateBottom:g.getBoundingClientRect().bottom,headline:getComputedStyle(document.querySelector('h1')).fontSize,selected:document.querySelector('input[name=model]:checked').value,active:[...document.querySelectorAll('.desktop-sidebar [aria-current=page]')].map(e=>e.getAttribute('aria-label')),badImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length}}""")
        check(f"{label}: responsive panes, active route, default model and no overflow", not data["overflow"] and data["rail"] == (72 if w >= 1024 else 0) and data["controls"] == (336 if w >= 768 else w) and data["layout"] == ("grid" if w >= 768 else "flex") and data["active"] == ["Image Studio"] and data["selected"] == "gemini-3.1-flash-image" and data["badImages"] == 0, data)
        if w >= 1024:
            check(f"{label}: Generate visible", data["generateBottom"] <= h, data["generateBottom"])
            click("button", "Expand sidebar")
            check(f"{label}: rail expansion", wait("document.querySelector('.desktop-sidebar').getBoundingClientRect().width===252"))
            click("button", "Collapse sidebar")
            wait("document.querySelector('.desktop-sidebar').getBoundingClientRect().width===72")
        else:
            click("button", "Open navigation")
            d = evaluate("() => {const d=document.querySelector('[data-slot=sheet-content]'); return {width:d.getBoundingClientRect().width,active:d.querySelector('[aria-current=page]').textContent,disabled:d.querySelectorAll('button:disabled').length,focus:d.contains(document.activeElement)};}")
            check(f"{label}: drawer grouping and focus", d == {"width":280,"active":"Image Studio","disabled":3,"focus":True}, d)
            tool("press_key", key="Tab")
            check(f"{label}: drawer Tab stays inside", evaluate("() => document.querySelector('[data-slot=sheet-content]').contains(document.activeElement)"))
            if w == 390: shot("studio-mobile-navigation.png")
            tool("press_key", key="Escape")
            check(f"{label}: Escape restores focus", wait("!document.querySelector('[data-slot=sheet-content]')&&document.activeElement.getAttribute('aria-label')==='Open navigation'"))
        shot(f"studio-empty-{label}.png", w == 390)
    tool("emulate", viewport="1440x900x1")
    click("button", "Generate image")
    check("Blank prompt validation and focus", evaluate("() => document.activeElement.id==='studio-prompt'&&document.querySelector('[role=alert]').textContent.includes('Describe')"))
    tool("fill", uid=uid("combobox", "Resolution"), value="512 px")
    tool("fill", uid=uid("radio", "Nano Banana Pro Precision for complex compositions"), value="true")
    check("Pro removes unsupported 512px setting", evaluate("() => document.querySelector('#resolution').value==='1K'&&![...document.querySelector('#resolution').options].some(o=>o.value==='512')"))
    tool("fill", uid=uid("radio", "Nano Banana 2 Fast, versatile image creation"), value="true")
    tool("fill", uid=uid("combobox", "Resolution"), value="512 px")
    errors = tool("list_console_messages", types=["error","warn"])
    check("Layout interactions have no console errors or warnings", "no console messages" in errors.lower(), errors)

def journey():
    tool("emulate", viewport="1440x900x1")
    tool("navigate_page", url="http://localhost:3000/image-studio")
    tool("wait_for", text=["Image Studio"], visible=True)
    # Observe real traffic, never substitute responses or provider calls.
    evaluate("""() => {window.__studioQA={requests:[],outputs:[]};const original=window.fetch.bind(window);window.fetch=async(...args)=>{if(String(args[0])==='/api/image-studio/generate'){const i=JSON.parse(args[1].body);window.__studioQA.requests.push({requestId:i.requestId,model:i.model,aspectRatio:i.aspectRatio,resolution:i.resolution,reference:!!i.reference,referenceAsset:i.reference?.assetId??null,prompt:i.prompt});const r=await original(...args);const d=await r.clone().json();if(d.job?.asset){const a=d.job.asset;window.__studioQA.outputs.push({id:a.id,jobId:a.jobId,model:a.model,providerModel:a.providerModel,width:a.width,height:a.height,mediaType:a.mediaType,source:a.source,referenceAsset:a.reference?.assetId??null});}return r;}return original(...args);};return true;}""")
    tool("fill", uid=uid("combobox", "Resolution"), value="512 px")
    tool("upload_file", uid=uid("button", "Add a reference"), filePaths=[str(ROOT / ".studio-data/verification/gemini-3.1-flash-image.jpg")])
    check("Upload preview and explicit source label", wait("document.querySelector('.studio-reference img')?.complete&&document.querySelector('.studio-reference').textContent.includes('Uploaded reference')"))
    prompt("Create a minimal studio photograph of a coral ceramic sphere on a graphite pedestal, a soft blue background, no text.")
    check("Prompt editor retains entered text", evaluate("() => document.querySelector('#studio-prompt').value.startsWith('Create a minimal')&&!document.querySelector('.field-caption').textContent.includes('0 / 4,000')"))
    click("button", "Generate image")
    check("Processing state disables duplicate submission", wait("document.querySelector('.generate-button').disabled&&!!document.querySelector('.studio-processing')"))
    shot("studio-processing-1440x900.png")
    tool("wait_for", text=["A new perspective.","Google is busy","could not","unavailable"], visible=True, timeout=140000)
    check("Nano Banana 2 image renders", wait("document.querySelector('.generated-image')?.complete&&document.querySelector('.generated-image').naturalWidth>0",10000))
    first = evaluate("() => window.__studioQA.outputs.at(-1)")
    check("Nano Banana 2 exact model and reference generation", first["model"] == "gemini-3.1-flash-image" and first["providerModel"].startswith("gemini-3.1-flash-image") and first["source"] == "ai-generated", first)
    download = click("link", "Download")
    check("Download action dispatched for Nano Banana 2", evaluate("() => {const a=document.querySelector('.result-actions a[download]');return a.download.endsWith('.jpg')&&a.href.startsWith('data:image/jpeg;base64,');}"), download[:1200])
    shot("studio-generated-1440x900.png")
    click("button", "Use as reference")
    check("Use as reference adds generated lineage and focuses prompt", evaluate("() => document.querySelector('.studio-reference').textContent.includes('AI-generated reference')&&document.activeElement.id==='studio-prompt'"))
    tool("fill", uid=uid("radio", "Nano Banana Pro Precision for complex compositions"), value="true")
    prompt("Keep the sphere and pedestal composition, change the sphere to warm amber ceramic and the background to dark graphite. No text.")
    click("button", "Generate image")
    tool("wait_for", text=["Your image is ready.","Google is busy","could not","unavailable"], timeout=140000)
    check("Pro image renders and session history has two", wait("document.querySelectorAll('.history-images button').length===2&&document.querySelector('.generated-image').complete",10000))
    second = evaluate("() => window.__studioQA.outputs.at(-1)")
    check("Nano Banana Pro exact model and generated-reference lineage", second["model"] == "gemini-3-pro-image" and second["providerModel"].startswith("gemini-3-pro-image") and second["referenceAsset"] == first["id"], second)
    click("link", "Download")
    finish_journey()

def finish_journey():
    # Resume here after an assertion failure to avoid repeating paid generations.
    check("Download action dispatched for Pro", evaluate("() => {const a=document.querySelector('.result-actions a[download]');return a.download.includes('gemini-3-pro-image')&&a.href.startsWith('data:image/');}"))
    # Change controls before Regenerate: it must still send the selected result's original request.
    prompt("This changed draft must not overwrite Regenerate settings")
    evaluate("() => { [...document.querySelectorAll('.result-actions button')].find(b=>b.textContent==='Regenerate').focus(); return document.activeElement.textContent; }")
    tool("press_key", key="Enter")
    tool("wait_for", text=["Your image is ready.","Google is busy","could not","unavailable"], timeout=140000)
    check("Regenerate produces a third real image", wait("document.querySelectorAll('.history-images button').length===3",10000))
    traffic = evaluate("() => window.__studioQA")
    a,b = traffic["requests"][-2:]
    check("Regenerate preserves original prompt, model, settings and reference", all(a[k] == b[k] for k in ["model","aspectRatio","resolution","referenceAsset","prompt"]) and a["requestId"] != b["requestId"], {"requests":traffic["requests"],"outputs":traffic["outputs"]})
    shot("studio-pro-1440x900.png")
    click("button", "View generated image 1")
    check("History selection changes viewer", evaluate("() => document.querySelector('.result-details p').textContent.includes('Nano Banana 2')&&document.querySelector('.history-images button[aria-pressed=true]').getAttribute('aria-label')==='View generated image 1'"))
    errors = tool("list_console_messages", types=["error","warn"])
    check("Real generation journey has no console errors/warnings", "no console messages" in errors.lower(), errors)

def regression():
    tool("emulate", viewport="1440x900x1")
    click("link", "Explore")
    tool("wait_for", text=["Curated inspiration"], visible=True)
    check("Explore returns to expanded grouped navigation", wait("document.querySelector('.desktop-sidebar').getBoundingClientRect().width===252"))
    click("searchbox", "Search inspiration")
    tool("type_text", text="perfume")
    click("button", "Product")
    check("Explore search and filter still intersect", evaluate("() => document.querySelectorAll('.inspiration-trigger').length===1"))
    click("button", "Quiet luxury Product — Preview")
    check("Explore preview remains source inspiration", evaluate("() => document.querySelector('[role=dialog]').textContent.includes('not an AI-generated asset')"))
    tool("press_key", key="Escape")
    check("Explore preview Escape restores focus", wait("!document.querySelector('[role=dialog]')&&document.activeElement.classList.contains('inspiration-trigger')"))
    click("link", "Image Studio")
    tool("wait_for", text=["Room for your next idea."], visible=True)
    check("Reentering Studio collapses rail and clears transient history", wait("document.querySelector('.desktop-sidebar').getBoundingClientRect().width===72&&!document.querySelector('.studio-history')"))
    # Negative API checks intentionally cause 4xx responses; no provider calls.
    errors = evaluate("""async () => {const base={requestId:crypto.randomUUID(),model:'gemini-3.1-flash-image',prompt:'A vase',aspectRatio:'1:1',resolution:'1K'};const results=[];for(const patch of [{model:'seedance'},{model:'gemini-3-pro-image',resolution:'512'},{seed:2},{reference:{name:'broken.png',dataUrl:'data:image/png;base64,aGVsbG8='}}]){const r=await fetch('/api/image-studio/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...base,...patch})});const d=await r.json();results.push({status:r.status,code:d.error?.code,message:d.error?.message});}return results;}""")
    check("Server rejects unsupported models/settings and corrupt reference", all(x["status"]==400 and x["message"] for x in errors), errors)

def negative():
    tool("navigate_page", url="http://localhost:3000/image-studio")
    tool("wait_for", text=["Room for your next idea."], visible=True)
    tool("emulate", viewport="390x844x1,mobile,touch")
    fixture = Path("/tmp/8x-invalid-reference.png")
    fixture.write_bytes(b"not an image")
    tool("upload_file", uid=uid("button", "Add a reference"), filePaths=[str(fixture)])
    prompt("A coral sphere")
    click("button", "Generate image")
    tool("wait_for", text=["The reference could not be read."], visible=True, timeout=15000)
    check("Corrupt upload returns a clear UI error without provider generation", evaluate("() => [...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('valid PNG'))&&!document.querySelector('.generate-button').disabled"))
    shot("studio-error-390x844.png", True)
    click("button", "Remove reference")
    tool("emulate", viewport="390x844x1,mobile,touch", networkConditions="Offline")
    click("button", "Generate image")
    tool("wait_for", text=["The connection was interrupted."], visible=True, timeout=15000)
    check("Offline failure explains credit uncertainty and allows recovery", evaluate("() => [...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('Reconnect'))&&!document.querySelector('.generate-button').disabled"))
    tool("emulate", viewport="390x844x1,mobile,touch")
    # Expected negative-path network/4xx console messages are not counted as
    # sunny-path console failures. Do not send a recovery generation here.

def mobile_generation():
    # Changing Chrome's mobile device mode reloads the page and intentionally
    # clears transient app history. One small request verifies the actual mobile
    # generation journey rather than restoring UI state artificially.
    tool("emulate", viewport="390x844x1,mobile,touch", prefersReducedMotion="reduce")
    tool("navigate_page", url="http://localhost:3000/image-studio")
    tool("wait_for", text=["Room for your next idea."], visible=True)
    tool("fill", uid=uid("combobox", "Resolution"), value="512 px")
    prompt("A minimal photograph of an amber glass vase on a graphite pedestal. Soft warm side light, no text.")
    click("button", "Generate image")
    tool("wait_for", text=["A new perspective.","could not","unavailable"], visible=True, timeout=140000)
    check("Mobile result fits viewport with loaded output and actions", wait("document.documentElement.scrollWidth===innerWidth&&document.querySelector('.generated-image')?.naturalWidth>0&&document.querySelectorAll('.result-actions a,.result-actions button').length===3",10000))
    shot("studio-generated-390x844.png")
    shot("studio-generated-mobile-full.png", True)
    errors = tool("list_console_messages", types=["error","warn"])
    check("Real generation journey has no console errors/warnings", "no console messages" in errors.lower(), errors)

if __name__ == "__main__":
    {"--layout":layout,"--journey":journey,"--finish-journey":finish_journey,"--mobile-generation":mobile_generation,"--regression":regression,"--negative":negative}[sys.argv[1]]()
