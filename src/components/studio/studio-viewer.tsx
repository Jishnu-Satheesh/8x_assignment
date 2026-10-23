"use client";
import Image from "next/image";
import { Download, Focus, ImagePlus, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MODELS, type GeneratedAsset } from "@/lib/studio/contracts";

export function StudioViewer({ asset, busy, onRegenerate, onReference }: { asset?: GeneratedAsset; busy: boolean; onRegenerate: (asset: GeneratedAsset) => void; onReference: (asset: GeneratedAsset) => void }) {
  return <div className="studio-result">
    <div className="studio-canvas" data-has-image={!!asset}>
      {asset ? <Image unoptimized priority src={asset.dataUrl} width={asset.width} height={asset.height} alt={`AI-generated: ${asset.prompt.slice(0, 200)}`} className="generated-image" /> : !busy && <div className="studio-empty"><div className="empty-art" aria-hidden="true"><span /><span /><Focus /></div><span className="eyebrow">A blank canvas. Endless possibilities.</span><h3>What do you see?</h3><p>Describe it on the left. Add a reference if you have one.<br />We’ll help you bring the idea into focus.</p></div>}
      {busy && <div className="studio-processing" role="status"><div className="processing-symbol"><Sparkles aria-hidden="true" /></div><h3>Bringing your idea into focus</h3><p>Good things take a moment. Keep this page open.</p><span>Generating with Google Gemini</span></div>}
    </div>
    {asset && <>
      <div className="result-details">
        <div>
          <span className="generated-label"><Sparkles aria-hidden="true" /> AI-generated</span>
          <p>{MODELS.find(m => m.id === asset.model)?.name} <span aria-hidden="true">·</span> {asset.width} × {asset.height} <span aria-hidden="true">·</span> {asset.aspectRatio}</p>
        </div>
        <span className="result-resolution">{asset.resolution === "512" ? "512 px" : asset.resolution}</span>
      </div>
      <div className="result-actions">
        <Button asChild variant="outline">
          <a href={asset.dataUrl} download={`8x-${asset.model}-${asset.id}.${asset.mediaType === "image/jpeg" ? "jpg" : asset.mediaType === "image/webp" ? "webp" : "png"}`}><Download aria-hidden="true" />Download</a>
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => onRegenerate(asset)}><RotateCcw aria-hidden="true" />Regenerate</Button>
        <Button type="button" variant="ghost" disabled={busy || asset.referenceReusable === false} onClick={() => onReference(asset)}><ImagePlus aria-hidden="true" />Use as reference</Button>
      </div>
      {asset.referenceReusable === false && <p className="field-help" role="status">Your image is ready to download. To reuse it, download it and upload it as a new reference.</p>}
      <details className="result-prompt">
        <summary>View prompt &amp; settings</summary>
        <p>{asset.prompt}</p>
        <dl>
          <div><dt>Provider model</dt><dd>{asset.providerModel}</dd></div>
          <div><dt>Output</dt><dd>{asset.aspectRatio} · {asset.resolution}</dd></div>
          {asset.reference && <div><dt>Reference</dt><dd>{asset.reference.name}</dd></div>}
        </dl>
      </details>
    </>}
  </div>;
}
