"use client";

import { useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { ArrowUpRight, Check, ImagePlus, Layers2, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MODELS, RATIOS, type AspectRatio, type GeneratedAsset, type GenerationInput, type GenerationJob, type ModelId, type ReferenceInput, type Resolution, type StudioAvailability } from "@/lib/studio/contracts";
import { StudioViewer } from "./studio-viewer";

const starters = [
  { label: "Product still life", prompt: "A sculptural coral perfume bottle on dark volcanic stone, soft side lighting, subtle mist, editorial product photography." },
  { label: "Editorial portrait", prompt: "An editorial portrait in a minimalist graphite studio, warm late-afternoon light, natural texture, confident composition." },
  { label: "An imagined place", prompt: "A quiet modernist house among desert dunes, sculptural architecture, warm dawn light, cinematic wide composition." },
];
export function ImageStudio({ availability }: { availability: StudioAvailability }) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<ModelId>(availability.enabledModels[0] ?? MODELS[0].id);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [resolution, setResolution] = useState<Resolution>("1K");
  const [reference, setReference] = useState<ReferenceInput>();
  const [job, setJob] = useState<GenerationJob>();
  const [history, setHistory] = useState<GeneratedAsset[]>([]);
  const [selected, setSelected] = useState<GeneratedAsset>();
  const [notice, setNotice] = useState("");
  const [validation, setValidation] = useState("");
  const [uploading, setUploading] = useState(false);
  const submitting = useRef(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const viewerRef = useRef<HTMLHeadingElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const originalReferences = useRef(new Map<string, ReferenceInput | undefined>());
  const busy = job?.status === "processing";
  const currentModel = MODELS.find(m => m.id === model)!;

  async function upload(file?: File) {
    if (!file) return;
    setValidation(""); setNotice("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setValidation("Choose one PNG, JPEG, or WebP image up to 5 MB."); return; }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file);
      });
      setReference({ name: file.name.slice(0, 160), dataUrl });
      setNotice("Reference added. Describe what you want to create or change.");
    } catch { setValidation("The reference could not be opened. Try another image."); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  async function generate(override?: GeneratedAsset) {
    if (submitting.current) return;
    const text = override?.prompt ?? prompt.trim();
    if (!text || text.length > 4000) { setValidation("Describe your image in 1–4,000 characters."); promptRef.current?.focus(); return; }
    if (!availability.available || uploading) return;
    const input: GenerationInput = { requestId: crypto.randomUUID(), prompt: text, model: override?.model ?? model, aspectRatio: override?.aspectRatio ?? aspectRatio, resolution: override?.resolution ?? resolution, ...(!override && reference ? { reference } : {}) };
    // Keep the exact original reference per result; matching filenames is insufficient.
    if (override?.reference) {
      const original = originalReferences.current.get(override.id);
      if (original) input.reference = original;
      else { setValidation("Add the original reference again before regenerating this image."); return; }
    }
    submitting.current = true; setValidation(""); setNotice("");
    setJob({ id: input.requestId, status: "processing", input, startedAt: new Date().toISOString() });
    try {
      const response = await fetch("/api/image-studio/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(150_000) });
      const data = await response.json();
      if (!response.ok || data.job?.status !== "succeeded") throw new Error(data.error?.message ?? "The image could not be generated. Please try later.");
      const asset = data.job.asset as GeneratedAsset;
      originalReferences.current.set(asset.id, input.reference);
      if (originalReferences.current.size > 6) originalReferences.current.delete(originalReferences.current.keys().next().value!);
      setHistory(items => [asset, ...items].slice(0, 6).filter((_, index, all) => all.slice(0, index + 1).reduce((n, a) => n + a.dataUrl.length, 0) <= 32_000_000));
      setSelected(asset); setJob({ id: input.requestId, status: "succeeded", asset });
      setNotice("Your image is ready.");
      requestAnimationFrame(() => viewerRef.current?.focus());
    } catch (error) {
      const message = error instanceof TypeError ? "The connection was interrupted. Provider credits may have been used. Reconnect before generating again." : error instanceof Error && error.name !== "TimeoutError" ? error.message : "The request timed out. Provider credits may have been used. Check your connection before generating again.";
      setJob({ id: input.requestId, status: "failed", code: "GENERATION_FAILED", message });
    } finally { submitting.current = false; }
  }
  function useReference(asset: GeneratedAsset) {
    if (asset.referenceReusable === false) { setValidation("Download this image and add it as a new reference."); return; }
    if (asset.dataUrl.length > 7_000_000) { setValidation("This image is too large to reuse directly. Download and resize it to 5 MB or less."); return; }
    setReference({ name: `Generated image ${history.findIndex(a => a.id === asset.id) + 1}`, dataUrl: asset.dataUrl, assetId: asset.id });
    setNotice("Generated image added as your reference. Describe the next change.");
    promptRef.current?.focus();
  }
  function submit(event: FormEvent) { event.preventDefault(); void generate(); }
  return (
    <div className="studio-page">
      <form className="studio-controls" onSubmit={submit}>
        <div className="studio-controls-body">
          <div className="studio-intro"><span className="eyebrow"><Sparkles aria-hidden="true" /> Make something yours</span><h1>Image Studio</h1><p>From a first thought to a fresh perspective.</p></div>
          <fieldset disabled={busy} className="studio-fields">
            <div className="studio-field"><label htmlFor="studio-prompt">Your idea <span>Required</span></label><textarea ref={promptRef} id="studio-prompt" value={prompt} onChange={e => { setPrompt(e.target.value); setValidation(""); }} maxLength={4000} placeholder="Describe the subject, setting, light, and feeling you have in mind…" aria-describedby="prompt-hint" aria-invalid={validation.startsWith("Describe") || undefined} /><div className="field-caption"><span id="prompt-hint">A little detail makes a difference.</span><span>{prompt.length.toLocaleString()} / 4,000</span></div></div>
            <div className="studio-field"><label htmlFor="studio-reference">Reference image <span>Optional</span></label>
              <input ref={fileRef} id="studio-reference" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e => void upload(e.target.files?.[0])} disabled={busy || uploading} />
              {reference ? <div className="studio-reference"><Image unoptimized src={reference.dataUrl} width={64} height={64} alt="Selected reference" /><div><strong>{reference.name}</strong><span>{reference.assetId ? "AI-generated reference" : "Uploaded reference"}</span></div><Button variant="ghost" size="icon" type="button" aria-label="Remove reference" onClick={() => { setReference(undefined); setNotice("Reference removed."); }}><X aria-hidden="true" /></Button></div> : <Button type="button" variant="outline" className="upload-reference" disabled={uploading} onClick={() => fileRef.current?.click()}><Upload aria-hidden="true" />{uploading ? "Reading image…" : "Add a reference"}<ArrowUpRight aria-hidden="true" /></Button>}
              <p className="field-help">PNG, JPEG, WebP · up to 5 MB. Sent to Google only when you generate.</p>
            </div>
            <fieldset className="studio-field model-field"><legend>Image model</legend><div className="model-options">{MODELS.map(m => <label key={m.id} className="model-option" data-selected={model === m.id} data-disabled={!availability.enabledModels.includes(m.id)}><input type="radio" name="model" value={m.id} checked={model === m.id} disabled={!availability.enabledModels.includes(m.id)} onChange={() => { setModel(m.id); if (!(m.resolutions as readonly string[]).includes(resolution)) setResolution("1K"); }} /><span className="model-icon"><Sparkles aria-hidden="true" /></span><span><strong>{m.name}</strong><small>{availability.enabledModels.includes(m.id) ? m.description : "Unavailable · not verified"}</small></span><Check className="model-check" aria-hidden="true" /></label>)}</div></fieldset>
            <div className="studio-setting-row"><div className="studio-field"><label htmlFor="aspect-ratio">Aspect ratio</label><select id="aspect-ratio" value={aspectRatio} onChange={e => setAspectRatio(e.target.value as AspectRatio)}>{RATIOS.map(r => <option key={r}>{r}</option>)}</select></div><div className="studio-field"><label htmlFor="resolution">Resolution</label><select id="resolution" value={resolution} onChange={e => setResolution(e.target.value as Resolution)}>{currentModel.resolutions.map(r => <option key={r} value={r}>{r === "512" ? "512 px" : r}</option>)}</select></div></div>
            <Tooltip><TooltipTrigger asChild><span className="future-model" tabIndex={0} aria-label="More image models, Coming soon"><Layers2 aria-hidden="true" /><span>More image models</span><button type="button" disabled tabIndex={-1}>Soon</button></span></TooltipTrigger><TooltipContent>Coming soon</TooltipContent></Tooltip>
          </fieldset>
        </div>
        <div className="studio-generate-bar">
          {!availability.available && <p className="studio-error" role="status">{availability.reason}</p>}
          {validation && <p className="studio-error" role="alert">{validation}</p>}
          {job?.status === "failed" && <p className="studio-error" role="alert">{job.message}</p>}
          <Button className="generate-button" type="submit" disabled={busy || uploading || !availability.available}><Sparkles aria-hidden="true" />{busy ? "Creating your image…" : "Generate image"}<span aria-hidden="true">↗</span></Button>
          <p>One image at a time. Higher resolutions use more credits.</p>
        </div>
      </form>
      <section className="studio-workspace" aria-label="Creative workspace" aria-busy={busy}>
        <header className="studio-workspace-header"><div><span className="eyebrow">Your creative space</span><h2 ref={viewerRef} tabIndex={-1}>{selected ? "A new perspective." : "Room for your next idea."}</h2></div><span className="session-badge"><span /> Session only</span></header>
        <StudioViewer asset={selected} busy={busy} onRegenerate={asset => void generate(asset)} onReference={useReference} />
        {!selected && !busy && <div className="studio-starters"><p>A starting point, if you need one</p><div>{starters.map(s => <button key={s.label} type="button" onClick={() => { setPrompt(s.prompt); promptRef.current?.focus(); }}><ImagePlus aria-hidden="true" />{s.label}<ArrowUpRight aria-hidden="true" /></button>)}</div></div>}
        {history.length > 0 && <section className="studio-history" aria-label="Session history"><div className="history-heading"><h3>Recent explorations <span>{history.length}</span></h3><p>Up to 6 images · download to keep</p></div><div className="history-images">{history.map((asset, i) => <button type="button" key={asset.id} disabled={busy} aria-label={`View generated image ${history.length - i}`} aria-pressed={selected?.id === asset.id} onClick={() => { setSelected(asset); setNotice("Selected an image from this session."); }}><Image unoptimized src={asset.dataUrl} width={80} height={80} alt="" /><span>{history.length - i}</span></button>)}</div></section>}
        <p className="studio-session-note">Images clear when you reload or leave Image Studio. Download anything you want to keep.</p>
        <p className="sr-only" role="status" aria-live="polite">{busy ? "Generating your image. Keep this page open." : notice}</p>
      </section>
    </div>
  );
}
