import type { ReactNode } from "react";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@snackbit/opendil/ui";
import { ChevronRight } from "lucide-react";
import { ShellScope } from "./shell-scope";

export interface SourceDisclosureProps {
  label: string;
  children: ReactNode;
}
export function SourceDisclosure({ label, children }: SourceDisclosureProps) {
  return (
    <ShellScope>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="xs">
            <ChevronRight size={12} />
            {label}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>{children}</CollapsibleContent>
      </Collapsible>
    </ShellScope>
  );
}
