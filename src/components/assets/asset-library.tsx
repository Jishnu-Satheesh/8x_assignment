"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Download, FolderClosed, ImagePlus, LockKeyhole, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InspirationImage } from "@/components/explore/inspiration-image";
import { StudioChallenge } from "@/components/studio/studio-challenge";
import { MODELS } from "@/lib/studio/contracts";
import type { StudioAsset } from "@/lib/studio/durable/types";

function modelName(asset: StudioAsset) {
  return MODELS.find(model => model.id === asset.model)?.name ?? asset.model;
}

async function readLibrary(signal?: AbortSignal): Promise<StudioAsset[] | null> {
  const session = await fetch("/api/image-studio/session", { cache: "no-store", signal });
  const identity = await session.json();
  if (!session.ok) throw new Error(identity.error?.message ?? "Your library could not be reached. Please try again.");
  if (!identity.user) return null;
  const response = await fetch("/api/image-studio/history", { cache: "no-store", signal });
  if (response.status === 401) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Your images could not be reached. Please try again.");
  return data.assets as StudioAsset[];
}

function AssetCard({ asset }: { asset: StudioAsset }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [previewAttempt, setPreviewAttempt] = useState(0);
  async function download() {
    if (downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const response = await fetch(asset.downloadUrl, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `8x-${asset.id}.${asset.mediaType === "image/jpeg" ? "jpg" : asset.mediaType === "image/webp" ? "webp" : "png"}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError("Your image could not be downloaded. Please reconnect and try again.");
    } finally { setDownloading(false); }
  }
  return <article className="asset-card">
    <Dialog onOpenChange={() => setDownloadError("")}>
      <DialogTrigger asChild>
        <button className="inspiration-trigger asset-trigger" type="button" aria-label={`Preview image: ${asset.prompt.slice(0, 120)}`}>
          <div className="card-image asset-thumb">
            <InspirationImage unoptimized src={asset.imageUrl} alt={`AI-generated: ${asset.prompt.slice(0, 200)}`} sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw" />
            <span className="asset-kind"><Sparkles aria-hidden="true" /> AI-generated</span>
            <span className="preview-indicator" aria-hidden="true"><ArrowUpRight /></span>
          </div>
          <div className="asset-caption">
            <h2>{asset.prompt}</h2>
            <p>{modelName(asset)} <span aria-hidden="true">·</span> {asset.width} × {asset.height}</p>
            <span className="asset-date">{new Date(asset.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}<ArrowUpRight aria-hidden="true" /></span>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="asset-dialog">
        <div className="asset-preview-image">
          <InspirationImage key={previewAttempt} unoptimized priority src={`${asset.imageUrl}?preview=${previewAttempt}`} alt={`AI-generated: ${asset.prompt.slice(0, 200)}`} sizes="(min-width: 768px) 520px, 100vw" />
        </div>
        <div className="asset-detail">
          <DialogHeader>
            <span className="assets-overline"><Sparkles aria-hidden="true" /> AI-generated image</span>
            <DialogTitle>Image details</DialogTitle>
            <DialogDescription>Saved in your private workspace.</DialogDescription>
          </DialogHeader>
          <dl className="asset-metadata">
            <div><dt>Model</dt><dd>{modelName(asset)}</dd></div>
            <div><dt>Output</dt><dd>{asset.width} × {asset.height} · {asset.aspectRatio}</dd></div>
            <div><dt>Resolution</dt><dd>{asset.resolution === "512" ? "512 px" : asset.resolution}</dd></div>
            <div><dt>Created</dt><dd>{new Date(asset.createdAt).toLocaleString()}</dd></div>
            {asset.referenceAssetId && <div><dt>Reference</dt><dd>Saved private image</dd></div>}
          </dl>
          <div className="asset-original-prompt"><h3>Original prompt</h3><p>{asset.prompt}</p></div>
          <div className="asset-detail-actions">
            <Button onClick={() => void download()} disabled={downloading}><Download aria-hidden="true" />{downloading ? "Downloading…" : "Download image"}</Button>
            <Button variant="ghost" onClick={() => setPreviewAttempt(value => value + 1)}><RefreshCw aria-hidden="true" />Reload preview</Button>
          </div>
          {downloadError && <p className="assets-error" role="alert">{downloadError}</p>}
        </div>
      </DialogContent>
    </Dialog>
  </article>;
}

export function AssetLibrary() {
  const [phase, setPhase] = useState<"loading" | "guest" | "ready" | "error">("loading");
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const [challenge, setChallenge] = useState("");
  const [challengeKey, setChallengeKey] = useState(0);

  const loadLibrary = useCallback((signal?: AbortSignal) =>
    readLibrary(signal).then(images => {
      if (signal?.aborted) return;
      setAssets(images ?? []);
      setPhase(images ? "ready" : "guest");
    }).catch((e: unknown) => {
      if (signal?.aborted) return;
      setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Your library could not be reached. Please reconnect and try again.");
      setPhase("error");
    }), []);

  function refreshLibrary() {
    setPhase("loading");
    setError("");
    void loadLibrary();
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadLibrary(controller.signal);
    return () => controller.abort();
  }, [loadLibrary]);

  async function openGuest() {
    setOpening(true);
    setError("");
    try {
      const response = await fetch("/api/image-studio/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeToken: challenge }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Your workspace could not be opened. Please try again.");
      setPhase("loading");
      await loadLibrary();
    } catch (e) {
      setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Your workspace could not be opened. Please reconnect and try again.");
    } finally {
      setOpening(false);
      setChallenge("");
      setChallengeKey(value => value + 1);
    }
  }

  return <div className="page-content assets-page">
    <header className="assets-header">
      <div><span className="assets-overline"><FolderClosed aria-hidden="true" /> Your private workspace</span><h1>My Assets</h1><p>Your generated images, saved with their original prompts and settings.</p></div>
      <Button asChild className="assets-create"><Link href="/image-studio"><ImagePlus aria-hidden="true" />Create an image<ArrowUpRight aria-hidden="true" /></Link></Button>
    </header>
    <div className="assets-toolbar">
      <p aria-live="polite">{phase === "ready" ? `${assets.length} saved ${assets.length === 1 ? "image" : "images"}` : "Your image library"}<span>Most recent first</span></p>
      <Button variant="ghost" size="icon" aria-label="Refresh images" disabled={phase === "loading" || opening} onClick={refreshLibrary}><RefreshCw aria-hidden="true" /></Button>
    </div>
    {phase === "loading" && <section aria-label="Loading your images" aria-busy="true"><span className="sr-only" role="status">Loading your images</span><div className="assets-grid" aria-hidden="true">{[0, 1, 2].map(i => <Skeleton key={i} className="asset-skeleton" />)}</div></section>}
    {phase === "guest" && <section className="empty-state assets-empty">
      <FolderClosed aria-hidden="true" /><h2>Your images have a place to land.</h2><p>Start a guest workspace to keep the images you generate in Image Studio.</p>
      <StudioChallenge key={challengeKey} onToken={setChallenge} />
      <Button disabled={opening} onClick={() => void openGuest()}>{opening ? "Opening workspace…" : "Start guest workspace"}</Button>
      {error && <p className="assets-error" role="alert">{error}</p>}
    </section>}
    {phase === "error" && <section className="empty-state assets-empty"><FolderClosed aria-hidden="true" /><h2>Your library is unavailable.</h2><p className="assets-error" role="alert">{error}</p><Button variant="outline" onClick={refreshLibrary}><RefreshCw aria-hidden="true" />Try again</Button></section>}
    {phase === "ready" && (assets.length ? <section className="assets-grid" aria-label="Saved generated images">{assets.map(asset => <AssetCard key={asset.id} asset={asset} />)}</section> : <section className="empty-state assets-empty"><ImagePlus aria-hidden="true" /><h2>Your first image starts with an idea.</h2><p>Images you make in Image Studio will appear here automatically.</p><Button asChild><Link href="/image-studio">Open Image Studio<ArrowUpRight aria-hidden="true" /></Link></Button></section>)}
    <footer className="assets-privacy"><LockKeyhole aria-hidden="true" /><p>Private to this browser’s guest workspace. Clearing cookies or changing devices loses access. Download images you want to keep independently.</p></footer>
  </div>;
}
