// The build replaces these with the spec/ Markdown of the same release.
declare const __DIL_AGENT_SPEC_PRIMARY__: string;
declare const __DIL_AGENT_SPEC_FULL__: string;
declare const __DIL_AGENT_SPEC_EXAMPLES__: string;

/**
 * Primary DIL authoring instructions (genui.agent.md). Put this in the system
 * prompt of the model that writes documents for this renderer version.
 */
export const agentSpec: string = __DIL_AGENT_SPEC_PRIMARY__;

/**
 * Complete component and property reference (genui.agent.full.md) for
 * targeted lookups, such as a retrieval tool or a larger context budget.
 */
export const agentSpecFull: string = __DIL_AGENT_SPEC_FULL__;

/** Executable example catalog (genui.examples.md) with recipes per feature. */
export const agentSpecExamples: string = __DIL_AGENT_SPEC_EXAMPLES__;
