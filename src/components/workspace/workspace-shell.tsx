"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Aperture,
  ChevronRight,
  Compass,
  Film,
  Fingerprint,
  FolderClosed,
  ImagePlus,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const groups = [
  {
    name: "Discover",
    items: [{ name: "Explore", icon: Compass, available: true }],
  },
  {
    name: "Create",
    items: [
      { name: "Image Studio", icon: ImagePlus, available: false },
      { name: "Cinematic Studio", icon: Film, available: false },
    ],
  },
  {
    name: "Workspace",
    items: [
      { name: "My Assets", icon: FolderClosed, available: false },
      { name: "Brand DNA", icon: Fingerprint, available: false },
    ],
  },
];

function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Higgsfield Explore home">
      <Aperture aria-hidden="true" />
      <span className="wordmark">higgsfield</span>
    </Link>
  );
}

function Navigation({
  collapsed = false,
  onExplore,
}: {
  collapsed?: boolean;
  onExplore?: () => void;
}) {
  return (
    <nav className="workspace-nav" aria-label="Main navigation">
      {groups.map((group) => (
        <section className="nav-group" key={group.name} aria-label={group.name}>
          <h2 className="nav-group-title">{group.name}</h2>
          {group.items.map(({ name, icon: Icon, available }) => (
            <Tooltip key={name}>
              <TooltipTrigger asChild>
                {available ? (
                  <Link
                    className="nav-item"
                    href="/"
                    aria-current="page"
                    aria-label="Explore"
                    onClick={onExplore}
                  >
                    <Icon aria-hidden="true" />
                    <span className="nav-label">{name}</span>
                  </Link>
                ) : (
                  <span
                    className="nav-tooltip-wrap"
                    tabIndex={collapsed ? 0 : undefined}
                    aria-label={collapsed ? `${name} Soon` : undefined}
                  >
                    <button
                      className="nav-item"
                      type="button"
                      disabled
                      aria-label={`${name} Soon`}
                    >
                      <Icon aria-hidden="true" />
                      <span className="nav-label">{name}</span>{" "}
                      <span className="soon-label" aria-hidden="true">
                        Soon
                      </span>
                    </button>
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent side="right">
                {name}
                {available ? "" : " · Coming soon"}
              </TooltipContent>
            </Tooltip>
          ))}
        </section>
      ))}
    </nav>
  );
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <div className="workspace-shell" data-collapsed={collapsed}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="desktop-sidebar" aria-label="Workspace sidebar">
        <Brand />
        <div id="desktop-navigation">
          <Navigation collapsed={collapsed} />
        </div>
        <div className="sidebar-footer">
          <p className="sidebar-note">
            A little room for big ideas.<span>Explore today. More soon.</span>
          </p>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="collapse-button"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!collapsed}
                aria-controls="desktop-navigation"
                onClick={() => setCollapsed(!collapsed)}
              >
                {collapsed ? (
                  <PanelLeftOpen aria-hidden="true" />
                ) : (
                  <PanelLeftClose aria-hidden="true" />
                )}
                <span className="collapse-label">Collapse sidebar</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {collapsed ? "Expand navigation" : "Collapse navigation"}
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="topbar-start">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mobile-menu"
                  aria-label="Open navigation"
                >
                  <Menu aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="mobile-nav">
                <SheetTitle className="sr-only">
                  Workspace navigation
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Explore is available. The other destinations are coming soon.
                </SheetDescription>
                <Brand />
                <Navigation onExplore={() => setMobileOpen(false)} />
                <p className="sidebar-note">
                  A little room for big ideas.
                  <span>Explore today. More soon.</span>
                </p>
              </SheetContent>
            </Sheet>
            <div className="mobile-brand">
              <Aperture aria-hidden="true" />
              <span className="wordmark">higgsfield</span>
            </div>
            <p className="breadcrumb">
              <span>Workspace</span>
              <ChevronRight aria-hidden="true" />
              <strong>Explore</strong>
            </p>
          </div>
          <span className="preview-status">
            <span className="status-long">Discovery </span>preview
          </span>
        </header>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
