"use client";
import "@snackbit/opendil/styles.css";
import type { ReactNode } from "react";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@snackbit/opendil/lib";
import { ChevronRight } from "lucide-react";
import { ShellScope } from "@/components/workbench/shell-scope";

export interface SourceDisclosureProps {
  label: string;
  children: ReactNode;
}

/** Collapsed source next to an example; its children render as normal MDX when opened. */
export function SourceDisclosure({ label, children }: SourceDisclosureProps) {
  return (
    <ShellScope className="od-source-disclosure">
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="xs">
            <ChevronRight size={12} aria-hidden />
            {label}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>{children}</CollapsibleContent>
      </Collapsible>
    </ShellScope>
  );
}
