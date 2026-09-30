import type { TenderPhaseInfo } from "../lib/tender-phase";

const STEPS = [
  { step: 1 as const, label: "1 Early Opportunity" },
  { step: 2 as const, label: "2 Formal Opportunity" },
  { step: 3 as const, label: "3 Submitted" },
  { step: 4 as const, label: "4 Result" },
];

type Props = {
  phase: TenderPhaseInfo;
};

export const TenderPhaseProgress = ({ phase }: Props) => (
  <div
    className="phase-progress"
    role="navigation"
    aria-label="Procurement phase progress"
  >
    {STEPS.map((item, index) => {
      const active = item.step === phase.step;
      const done = item.step < phase.step;
      return (
        <span key={item.step} className="phase-progress-item">
          {index > 0 ? <span className="phase-progress-arrow">→</span> : null}
          <span
            className={`phase-progress-step${active ? " is-active" : ""}${done ? " is-done" : ""}`}
          >
            {item.label}
          </span>
        </span>
      );
    })}
  </div>
);

export const TenderPhaseCard = ({ phase }: Props) => (
  <section className="card phase-card" aria-label="Procurement phase">
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div>
        <h3 style={{ marginTop: 0 }}>{phase.title}</h3>
        <p className="muted" style={{ marginTop: 4 }}>
          {phase.subtitle}
        </p>
      </div>
      <span className="badge">{phase.badge}</span>
    </div>
    <p style={{ marginBottom: 0 }}>
      <strong>Recommended action:</strong> {phase.recommendedAction}
    </p>
    {phase.explanation ? (
      <p className="muted" style={{ marginBottom: 0 }}>
        {phase.explanation}
      </p>
    ) : null}
    <TenderPhaseProgress phase={phase} />
  </section>
);
