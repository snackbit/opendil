"use client";
import dynamic from "next/dynamic";
import "./workbench.css";
import type { WorkbenchProps } from "./workbench";

/*
 * The workbench runs only in the browser: it reads session storage and the URL while it mounts,
 * and it pulls in OpenDIL and Monaco. Loading it here keeps both out of the route chunk that
 * Next.js prefetches for every visible link to a playground page.
 */
const Workbench = dynamic(
  () => import("./workbench").then((module) => module.Workbench),
  {
    ssr: false,
    loading: () => (
      <div className="od-demo-workspace">
        <div className="od-workbench-loading" role="status">
          Loading the interactive workbench…
        </div>
      </div>
    ),
  },
);

export function WorkbenchIsland(props: WorkbenchProps) {
  return <Workbench {...props} />;
}
