import type { ReactNode } from "react";
import type { TenderPhaseInfo } from "../lib/tender-phase";
import { PHASE_PROGRESS_STEPS } from "../lib/tender-phase";
import { UI } from "../lib/ui-labels";

type ProgressProps = {
  phase: TenderPhaseInfo;
};

export const TenderPhaseProgress = ({ phase }: ProgressProps) => (
  <div
    className="phase-progress"
    role="navigation"
    aria-label="Πρόοδος σταδίων διαγωνισμού"
  >
    {PHASE_PROGRESS_STEPS.map((item, index) => {
      const active = item.step === phase.step;
      const done = item.step < phase.step;
      return (
        <span key={item.step} className="phase-progress-item">
          {index > 0 ? <span className="phase-progress-arrow">→</span> : null}
          <span
            className={`phase-progress-step${active ? " is-active" : ""}${done ? " is-done" : ""}`}
          >
            {item.step}. {item.label}
          </span>
        </span>
      );
    })}
  </div>
);

type CardProps = {
  phase: TenderPhaseInfo;
  actions?: ReactNode;
};

/** Single phase card: stage + next action + optional primary CTAs (no duplicate "what now"). */
export const TenderPhaseCard = ({ phase, actions }: CardProps) => (
  <section className="card phase-card" aria-label="Τρέχον στάδιο">
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div>
        <h3 style={{ marginTop: 0 }}>{phase.title}</h3>
        <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
          {phase.subtitle}
        </p>
      </div>
      <span className="badge">{phase.badge}</span>
    </div>
    <p style={{ marginBottom: 0 }}>
      <strong>{UI.nextAction}:</strong> {phase.recommendedAction}
    </p>
    {phase.explanation ? (
      <p className="muted" style={{ marginBottom: 0 }}>
        {phase.explanation}
      </p>
    ) : null}
    {actions ? <div className="actions">{actions}</div> : null}
    <TenderPhaseProgress phase={phase} />
  </section>
);
