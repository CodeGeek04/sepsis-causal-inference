import { useEffect, useState } from "react";

const steps = [
  { id: "step-1", short: "Why raw comparison fails" },
  { id: "step-2", short: "Timeline and cohort row" },
  { id: "step-3", short: "What notes add" },
  { id: "step-4", short: "Three note encodings" },
  { id: "step-5", short: "Matching and weighting" },
  { id: "step-6", short: "M5 tie-break" },
  { id: "step-7", short: "Reading effect estimates" },
  { id: "step-8", short: "Semi-synthetic truth test" },
  { id: "step-9", short: "Conclusion" },
];

const comparePatients = {
  raw: {
    treated: [
      { id: "T1", severity: 91, note: "SOFA 11, low MAP", emphasis: "high" },
      { id: "T2", severity: 79, note: "High WBC, respiratory failure", emphasis: "high" },
      { id: "T3", severity: 70, note: "Confusion, pulmonary source", emphasis: "high" },
    ],
    untreated: [
      { id: "C1", severity: 68, note: "Moderate severity" },
      { id: "C2", severity: 42, note: "Lower baseline risk" },
      { id: "C3", severity: 24, note: "Clearly less sick" },
    ],
    caption:
      "Raw comparison mixes treatment effect with baseline severity. The untreated side still includes much lower-risk patients.",
  },
  adjusted: {
    treated: [
      { id: "T1", severity: 91, note: "Matched to similar control", emphasis: "high" },
      { id: "T2", severity: 79, note: "Matched to similar control", emphasis: "high" },
      { id: "T3", severity: 70, note: "Matched to similar control", emphasis: "high" },
    ],
    untreated: [
      { id: "C1", severity: 86, note: "Retained as credible comparison" },
      { id: "C2", severity: 76, note: "Retained as credible comparison" },
      { id: "C4", severity: 67, note: "Retained as credible comparison" },
    ],
    caption:
      "Adjustment does not relabel patients. It changes which untreated patients count as believable comparisons or how strongly each one counts.",
  },
};

const demoCases = {
  treated: {
    title: "Local demo anchor, treated within 4 hours",
    subject: "subject_id 10004235",
    hadm: "hadm_id 24181354",
    stay: "stay_id 34100191",
    onset: "2196-02-24 17:07",
    treatment: "2196-02-24 17:30",
    outcome: "No in-hospital death in demo tables",
    windowHours: 0.38,
    result: "treated = 1",
    details: [
      ["Admission", "Urgent, Black/Cape Verdean, Medicaid"],
      ["Diagnoses", "Atrial fibrillation, acute respiratory failure, liver and cardiac complications"],
      ["Meds", "CefePIME, hydrocortisone, insulin, heparin"],
    ],
  },
  untreated: {
    title: "Local demo anchor, not treated early by the paper definition",
    subject: "subject_id 10037861",
    hadm: "hadm_id 24540843",
    stay: "stay_id 34531557",
    onset: "2117-03-14 16:35",
    treatment: "2117-03-14 21:00",
    outcome: "Hospital expire flag = 1",
    windowHours: 4.42,
    result: "treated = 0",
    details: [
      ["Admission", "EW emergency, race unknown"],
      ["Diagnoses", "Sepsis, ventilator dependence, CKD stage 3, UTI"],
      ["Meds", "CeFAZolin, heparin, insulin, metoprolol, spironolactone"],
    ],
  },
};

const methodViews = {
  tfidf: {
    title: "TF-IDF: literal phrase memory",
    body:
      "The note is turned into 500 weighted word or phrase features. The model notices terms such as 'bedbound', 'DNR', or 'encephalopathy', but it does not explicitly know they are categories. It just sees a high-dimensional word pattern.",
    chips: [
      ["Vector length", "500"],
      ["Strength", "Simple, transparent word clues"],
      ["Weakness", "Paraphrases and context can fragment signal"],
      ["Paper use", "Structured EHR + 500 TF-IDF features in M2"],
    ],
    visualType: "bars",
  },
  embedding: {
    title: "Embedding: compress note meaning",
    body:
      "BioClinicalBERT maps the note into a dense vector. Long notes are split into windows, window vectors are averaged, then PCA compresses 768 dimensions down to 50. The representation is richer than word counts, but far less interpretable.",
    chips: [
      ["Raw dims", "768"],
      ["Post-PCA dims", "50"],
      ["Strength", "Captures broader semantic similarity"],
      ["Weakness", "Meaning is dense, hidden, and lossy after pooling"],
    ],
    visualType: "cloud",
  },
  llm: {
    title: "LLM extraction: translate note into patient-state variables",
    body:
      "Instead of feeding generic text vectors to the causal model, the paper extracts named covariates such as functional status, mental status, code status, infection source, and substance use. The output is constrained, structured, and directly aligned with confounding.",
    chips: [
      ["Core 5", "functional, mental, code, source, substance"],
      ["Extra 2", "source control, family support"],
      ["Strength", "Interpretable, clinically targeted adjustment"],
      ["Paper use", "M4, M5, M6, M7"],
    ],
    visualType: "json",
  },
};

const tfidfExample = {
  note:
    "baseline functional decline family reports confusion likely pulmonary source code status changed during hospitalization",
  corpusSize: 4,
  terms: [
    { term: "family", tf: 1, df: 1, why: "Rare across notes, so it gets a stronger lift." },
    { term: "confusion", tf: 1, df: 2, why: "Present here and somewhat specific, so it stays useful." },
    { term: "pulmonary", tf: 1, df: 3, why: "Commoner across notes, so it gets a smaller lift." },
    { term: "status", tf: 1, df: 2, why: "Moderately common, so it lands in the middle." },
  ],
};

const matchingData = {
  treated: [
    { id: "T1", severity: 90, ps: 0.82, outcome: "died" },
    { id: "T2", severity: 76, ps: 0.64, outcome: "survived" },
    { id: "T3", severity: 61, ps: 0.43, outcome: "died" },
  ],
  control: [
    { id: "C1", severity: 88, ps: 0.79, outcome: "died", match: true },
    { id: "C2", severity: 74, ps: 0.67, outcome: "survived", match: true },
    { id: "C3", severity: 59, ps: 0.41, outcome: "survived", match: true },
    { id: "C4", severity: 23, ps: 0.08, outcome: "survived", match: false },
  ],
};

const weightingData = [
  { id: "A", treated: 1, ps: 0.9, weight: 0.6, outcome: "died" },
  { id: "B", treated: 1, ps: 0.8, weight: 0.7, outcome: "survived" },
  { id: "C", treated: 1, ps: 0.55, weight: 1.4, outcome: "died" },
  { id: "D", treated: 0, ps: 0.5, weight: 1.3, outcome: "died" },
  { id: "E", treated: 0, ps: 0.2, weight: 0.8, outcome: "survived" },
  { id: "F", treated: 0, ps: 0.1, weight: 0.5, outcome: "survived" },
];

const hammingExample = {
  treated: {
    id: "T2",
    ps: 0.71,
    note: "Structured matching says this treated patient has several plausible controls.",
    features: {
      functionalStatus: "fully dependent",
      mentalStatus: "confused",
      codeStatus: "DNR",
      infectionSource: "pulmonary",
      substanceUse: "none",
    },
  },
  candidates: [
    {
      id: "C7",
      ps: 0.69,
      structuredGap: "close PS candidate",
      features: {
        functionalStatus: "fully dependent",
        mentalStatus: "confused",
        codeStatus: "full code",
        infectionSource: "pulmonary",
        substanceUse: "none",
      },
    },
    {
      id: "C8",
      ps: 0.7,
      structuredGap: "close PS candidate",
      features: {
        functionalStatus: "partially dependent",
        mentalStatus: "alert",
        codeStatus: "full code",
        infectionSource: "pulmonary",
        substanceUse: "none",
      },
    },
    {
      id: "C9",
      ps: 0.68,
      structuredGap: "close PS candidate",
      features: {
        functionalStatus: "fully dependent",
        mentalStatus: "confused",
        codeStatus: "DNR",
        infectionSource: "pulmonary",
        substanceUse: "none",
      },
    },
  ],
};

const paperResults = [
  { method: "M1", label: "Structured only", expandedLabelLines: ["Structured only"], effect: 0.055, low: 0.03, high: 0.08, tone: "rust" },
  { method: "M2", label: "Structured + TF-IDF", expandedLabelLines: ["Structured +", "TF-IDF"], effect: 0.008, low: -0.015, high: 0.031, tone: "gold" },
  { method: "M3", label: "Structured + embedding", expandedLabelLines: ["Structured +", "embedding"], effect: 0.038, low: 0.012, high: 0.063, tone: "gold" },
  {
    method: "M4",
    label: "Structured + core 5 LLM covariates",
    expandedLabelLines: ["Structured + core 5", "LLM covariates"],
    effect: 0.027,
    low: 0.001,
    high: 0.052,
    tone: "teal",
  },
  {
    method: "M5",
    label: "Structured match, note tie-break",
    expandedLabelLines: ["Structured match,", "note tie-break"],
    effect: 0.06,
    low: 0.035,
    high: 0.085,
    tone: "rust",
  },
  {
    method: "M6",
    label: "IPW + core 5 LLM covariates",
    expandedLabelLines: ["IPW + core 5", "LLM covariates"],
    effect: 0.052,
    low: 0.03,
    high: 0.074,
    tone: "rust",
  },
  { method: "AIPW", label: "Doubly robust check", expandedLabelLines: ["Doubly robust check"], effect: 0.019, low: 0.004, high: 0.043, tone: "teal" },
];

const simulationViews = {
  benefit: {
    title: "Beneficial-treatment world, smaller bias is better",
    bars: [
      { method: "M1", value: 0.0143, tone: "rust" },
      { method: "M4", value: 0.0003, tone: "teal" },
      { method: "M6", value: 0.0012, tone: "teal" },
      { method: "M7", value: 0.0005, tone: "teal" },
    ],
    caption:
      "When treatment and outcome both depend on note-derived patient state, direct augmentation with extracted covariates recovers the planted truth much more closely than structured-only matching.",
  },
  null: {
    title: "Null-effect world, the truth is zero",
    bars: [
      { method: "M1", value: 0.0123, tone: "rust" },
      { method: "M2", value: 0.0102, tone: "gold" },
      { method: "M3", value: 0.0064, tone: "gold" },
      { method: "M4", value: 0.0027, tone: "teal" },
      { method: "M6", value: 0.0036, tone: "teal" },
      { method: "M7", value: 0.0011, tone: "teal" },
    ],
    caption:
      "In a world with no treatment effect, the methods using extracted note covariates stay closer to zero, which means less false signal.",
  },
  noise: {
    title: "Extraction-noise stress test for M4",
    bars: [
      { method: "0% noise", value: 0.0003, tone: "teal" },
      { method: "5% noise", value: 0.0023, tone: "teal" },
      { method: "10% noise", value: 0.0045, tone: "gold" },
      { method: "20% noise", value: 0.0081, tone: "rust" },
      { method: "M1 baseline", value: 0.0143, tone: "violet" },
    ],
    caption:
      "Noise hurts extraction quality, but M4 still beats the structured-only baseline even when a substantial share of extracted categories is corrupted.",
  },
};

function toneColor(tone) {
  const map = {
    rust: "var(--rust)",
    gold: "var(--gold)",
    teal: "var(--teal)",
    violet: "var(--violet-ink)",
  };
  return map[tone] || "var(--ink)";
}

function useVisibleSteps() {
  const [visibleSteps, setVisibleSteps] = useState(new Set(["step-1"]));
  const [activeStep, setActiveStep] = useState("step-1");

  useEffect(() => {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        setVisibleSteps((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            if (entry.isIntersecting) next.add(entry.target.id);
          }
          return next;
        });
      },
      { threshold: 0.18 }
    );

    const currentObserver = new IntersectionObserver(
      (entries) => {
        const active = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (active) setActiveStep(active.target.id);
      },
      { threshold: [0.25, 0.45, 0.7] }
    );

    const stepNodes = document.querySelectorAll(".step");
    stepNodes.forEach((node) => {
      revealObserver.observe(node);
      currentObserver.observe(node);
    });

    return () => {
      revealObserver.disconnect();
      currentObserver.disconnect();
    };
  }, []);

  return {
    visibleSteps,
    activeStep,
  };
}

function Hero({ reducedMotion, onToggleMotion }) {
  return (
    <header className="hero" id="top">
      <div className="hero__backdrop" aria-hidden="true">
        <div className="hero__wash hero__wash--a"></div>
        <div className="hero__wash hero__wash--b"></div>
        <div className="hero__grid"></div>
      </div>
      <div className="hero__inner">
        <p className="hero__eyebrow reveal is-visible">Interactive paper walkthrough</p>
        <h1 className="hero__title reveal is-visible">
          <span>Causal Notes</span>
          <span className="hero__title-accent">How a note becomes a fairer comparison</span>
        </h1>
        <p className="hero__lede reveal is-visible">
          A step-by-step visual explanation of how the paper moves from messy ICU data to note-derived causal
          adjustment, with real paper results and MIMIC-IV demo anchors.
        </p>
        <div className="hero__actions reveal is-visible">
          <a className="button button--primary" href="#story">
            Start the walkthrough
          </a>
          <button className="button button--ghost" onClick={onToggleMotion} type="button">
            {reducedMotion ? "Enable motion" : "Reduce motion"}
          </button>
        </div>
        <div className="hero__metrics reveal is-visible" aria-label="Key paper summary">
          <article>
            <span className="metric__label">Problem</span>
            <strong>Treated patients start sicker</strong>
          </article>
          <article>
            <span className="metric__label">Main move</span>
            <strong>Extract 5 note covariates</strong>
          </article>
          <article>
            <span className="metric__label">Winner</span>
            <strong>M4 direct augmentation</strong>
          </article>
        </div>
      </div>
    </header>
  );
}

function StoryNav({ activeStep }) {
  return (
    <aside className="story-rail">
      <div className="story-rail__inner">
        <p className="story-rail__label">Steps</p>
        <nav className="story-nav" aria-label="Paper walkthrough navigation">
          {steps.map((step, index) => (
            <a className={activeStep === step.id ? "is-active" : ""} href={`#${step.id}`} key={step.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <span>{step.short}</span>
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}

function StepShell({ id, kicker, title, visible, current, intro = false, final = false, children }) {
  return (
    <article
      className={`step ${intro ? "step--intro" : ""} ${final ? "step--final" : ""} reveal-block ${visible ? "is-visible" : ""} ${current ? "is-current" : ""}`}
      id={id}
    >
      <div className="step__header">
        <p className="step__kicker">{kicker}</p>
        <h2>{title}</h2>
      </div>
      {children}
    </article>
  );
}

function StepLedger({ have, adds }) {
  return (
    <div className="step-ledger">
      <article>
        <span>We have so far</span>
        <strong>{have.title}</strong>
        <p>{have.body}</p>
      </article>
      <article>
        <span>This step adds</span>
        <strong>{adds.title}</strong>
        <p>{adds.body}</p>
      </article>
    </div>
  );
}

function StepMap({ items }) {
  return (
    <div className="step-map">
      {items.map((item) => (
        <article key={item.step}>
          <span>{item.step}</span>
          <strong>{item.title}</strong>
        </article>
      ))}
    </div>
  );
}

function RawVsAdjustedStep() {
  const [mode, setMode] = useState("raw");
  const data = comparePatients[mode];
  return (
    <div className="two-up">
      <div className="prose">
        <p>
          The paper asks whether <strong>early vasopressors</strong> change <strong>28-day mortality</strong> in sepsis.
          The trap is that treated patients are usually sicker before treatment starts. If we compare raw death rates,
          we mix treatment effect with baseline severity.
        </p>
        <p>Use the switch to see how a raw comparison differs from a fairer adjusted comparison.</p>
      </div>
      <div className="viz-card viz-card--contrast">
        <div className="segmented-control" role="tablist" aria-label="Comparison mode">
          <button className={mode === "raw" ? "is-active" : ""} onClick={() => setMode("raw")} type="button">
            Raw groups
          </button>
          <button className={mode === "adjusted" ? "is-active" : ""} onClick={() => setMode("adjusted")} type="button">
            Adjusted view
          </button>
        </div>
        <div className="compare-viz">
          <div className="compare-viz__column">
            <h3>Treated</h3>
            <div className="compare-viz__people">
              {data.treated.map((person) => (
                <article className="patient-pill" data-emphasis={person.emphasis || "mid"} key={person.id}>
                  <div className="patient-pill__meta">
                    <strong>{person.id}</strong>
                    <span>Severity {person.severity}</span>
                  </div>
                  <div className="patient-pill__severity">
                    <span style={{ width: `${person.severity}%` }}></span>
                  </div>
                  <span>{person.note}</span>
                </article>
              ))}
            </div>
          </div>
          <div className="compare-viz__divider"></div>
          <div className="compare-viz__column">
            <h3>Untreated</h3>
            <div className="compare-viz__people">
              {data.untreated.map((person) => (
                <article className="patient-pill" data-emphasis={person.emphasis || "mid"} key={person.id}>
                  <div className="patient-pill__meta">
                    <strong>{person.id}</strong>
                    <span>Severity {person.severity}</span>
                  </div>
                  <div className="patient-pill__severity">
                    <span style={{ width: `${person.severity}%` }}></span>
                  </div>
                  <span>{person.note}</span>
                </article>
              ))}
            </div>
          </div>
        </div>
        <p className="viz-caption">{data.caption}</p>
      </div>
    </div>
  );
}

function TimelineStep() {
  const [caseKey, setCaseKey] = useState("treated");
  const data = demoCases[caseKey];
  const treatmentPos = Math.min(88, 14 + data.windowHours * 4.5);
  const markerClass = caseKey === "treated" ? "timeline-marker__dot--treatment" : "timeline-marker__dot--outcome";
  const tightSpacing = treatmentPos - 14 < 12;
  return (
    <div className="two-up">
      <div className="prose">
        <p>
          Before any model exists, the data must be turned into one row per eligible sepsis ICU episode. The page below
          shows the study timeline: sepsis onset anchors the 4-hour treatment window and the 28-day outcome window.
        </p>
        <p>The examples are grounded in the local MIMIC-IV demo cohort: one treated early, one untreated by the paper&apos;s definition.</p>
      </div>
      <div className="viz-card">
        <div className="segmented-control" role="tablist" aria-label="Case study">
          <button className={caseKey === "treated" ? "is-active" : ""} onClick={() => setCaseKey("treated")} type="button">
            Demo case: treated
          </button>
          <button className={caseKey === "untreated" ? "is-active" : ""} onClick={() => setCaseKey("untreated")} type="button">
            Demo case: untreated
          </button>
        </div>
        <div className="timeline-card">
          <div>
            <h3>{data.title}</h3>
            <p className="viz-caption">
              {data.subject}, {data.hadm}, {data.stay}
            </p>
          </div>
          <div className="timeline-track">
            <div className="timeline-track__line"></div>
            <div
              className={`timeline-marker timeline-marker--above ${tightSpacing ? "timeline-marker--tight-left" : ""}`}
              style={{ left: "14%" }}
            >
              <span className="timeline-marker__dot timeline-marker__dot--onset"></span>
              <span className="timeline-marker__label">
                Sepsis onset
                <br />
                {data.onset}
              </span>
            </div>
            <div
              className={`timeline-marker timeline-marker--below ${tightSpacing ? "timeline-marker--tight-right" : ""}`}
              style={{ left: `${treatmentPos}%` }}
            >
              <span className={`timeline-marker__dot ${markerClass}`}></span>
              <span className="timeline-marker__label">
                First vasopressor
                <br />
                {data.treatment}
              </span>
            </div>
            <div className="timeline-marker timeline-marker--below timeline-marker--edge-right" style={{ left: "92%" }}>
              <span className="timeline-marker__dot timeline-marker__dot--outcome"></span>
              <span className="timeline-marker__label">
                Outcome window closes
                <br />
                28 days later
              </span>
            </div>
          </div>
          <div className="timeline-meta">
            {data.details.map(([label, value]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          <p className="viz-caption">
            Hours from onset to vasopressor: {data.windowHours.toFixed(2)}. By the paper&apos;s rule, {data.result}.
          </p>
        </div>
      </div>
    </div>
  );
}

function RevealStep() {
  const [split, setSplit] = useState(62);
  return (
    <div className="split-stage">
      <div className="prose">
        <p>
          Structured EHR variables tell us age, labs, vitals, and severity scores. Clinical notes often contain the
          missing state: frailty, confusion, DNR status, infection source, family involvement.
        </p>
        <p>Drag the divider to compare what the model sees from tables alone versus tables plus narrative note context.</p>
      </div>
      <div className="reveal-comparison">
        <div className="reveal-pane reveal-pane--base">
          <h3>Structured tables only</h3>
          <ul>
            <li>Age 67</li>
            <li>SOFA 11</li>
            <li>MAP 58</li>
            <li>Creatinine 2.1</li>
            <li>WBC 18.4</li>
          </ul>
        </div>
        <div className="reveal-pane reveal-pane--overlay" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
          <h3>What the note adds</h3>
          <p>
            &quot;Baseline functional decline, family reports confusion, likely pulmonary source, code status changed during hospitalization.&quot;
          </p>
        </div>
        <input
          className="reveal-range"
          type="range"
          min="0"
          max="100"
          value={split}
          onChange={(event) => setSplit(Number(event.target.value))}
          aria-label="Reveal note contribution"
        />
      </div>
    </div>
  );
}

function MethodStep() {
  const [method, setMethod] = useState("tfidf");
  const [selectedTfidfTerm, setSelectedTfidfTerm] = useState("family");
  const view = methodViews[method];
  const tfidfTerm = tfidfExample.terms.find((item) => item.term === selectedTfidfTerm) || tfidfExample.terms[0];
  const tfidfIdf = Math.log((1 + tfidfExample.corpusSize) / (1 + tfidfTerm.df)) + 1;
  const tfidfRaw = tfidfTerm.tf * tfidfIdf;
  return (
    <>
      <div className="method-gallery">
        <button className={`method-card ${method === "tfidf" ? "is-active" : ""}`} onClick={() => setMethod("tfidf")} type="button">
          <span className="method-card__eyebrow">TF-IDF</span>
          <strong>500 word features</strong>
          <p>Literal phrase patterns like &quot;bedbound&quot; or &quot;DNR&quot;.</p>
        </button>
        <button className={`method-card ${method === "embedding" ? "is-active" : ""}`} onClick={() => setMethod("embedding")} type="button">
          <span className="method-card__eyebrow">Embedding</span>
          <strong>768 → 50 PCA dims</strong>
          <p>Dense note meaning compressed into a small vector.</p>
        </button>
        <button className={`method-card ${method === "llm" ? "is-active" : ""}`} onClick={() => setMethod("llm")} type="button">
          <span className="method-card__eyebrow">LLM extraction</span>
          <strong>5 core + 2 extra covariates</strong>
          <p>Human-readable patient descriptors used for adjustment.</p>
        </button>
      </div>
      <div className="viz-card viz-card--wide">
        <div className="sheet-card">
          <div>
            <h3>{view.title}</h3>
            <p>{view.body}</p>
          </div>
          {view.visualType === "bars" && (
            <>
              <div className="sheet-grid">
                {[
                  ["bedbound", "0.74"],
                  ["DNR", "0.63"],
                  ["encephalopathy", "0.52"],
                  ["nursing facility", "0.44"],
                ].map(([label, value]) => (
                  <div className="sheet-chip" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div className="weighting-calculator">
                <div>
                  <h3>Worked example, how a TF-IDF value is computed</h3>
                  <p>
                    This walkthrough does not ship raw MIMIC notes, so the example below uses the exact teaching note
                    snippet already shown on the page and computes a real TF-IDF number on a tiny four-note corpus.
                  </p>
                </div>
                <article className="sheet-chip">
                  <span>Example note</span>
                  <strong style={{ fontSize: "1rem", lineHeight: "1.5", fontWeight: 600 }}>
                    {tfidfExample.note}
                  </strong>
                </article>
                <div className="segmented-control segmented-control--wrap" role="tablist" aria-label="TF-IDF example term">
                  {tfidfExample.terms.map((item) => (
                    <button
                      className={selectedTfidfTerm === item.term ? "is-active" : ""}
                      key={item.term}
                      onClick={() => setSelectedTfidfTerm(item.term)}
                      type="button"
                    >
                      {item.term}
                    </button>
                  ))}
                </div>
                <div className="formula-stack">
                  <article className="formula-card">
                    <span>Term frequency</span>
                    <strong>tf = {tfidfTerm.tf}</strong>
                  </article>
                  <article className="formula-card">
                    <span>Document frequency</span>
                    <strong>df = {tfidfTerm.df} / {tfidfExample.corpusSize}</strong>
                  </article>
                  <article className="formula-card">
                    <span>IDF formula</span>
                    <strong>ln((1 + N) / (1 + df)) + 1</strong>
                  </article>
                  <article className="formula-card">
                    <span>IDF value</span>
                    <strong>{tfidfIdf.toFixed(2)}</strong>
                  </article>
                  <article className="formula-card">
                    <span>Raw TF-IDF</span>
                    <strong>{tfidfRaw.toFixed(2)}</strong>
                  </article>
                </div>
                <p>
                  For <strong>{tfidfTerm.term}</strong>, the calculation is:
                  {" "}
                  <strong>{tfidfTerm.tf} × {tfidfIdf.toFixed(2)} = {tfidfRaw.toFixed(2)}</strong>.
                </p>
                <p>
                  Interpretation: TF-IDF values are <strong>not probabilities</strong>. A larger value means the term is
                  more characteristic of this note relative to the rest of the corpus. Here,{" "}
                  <strong>{tfidfTerm.term}</strong> gets this score because it appears in this note and {tfidfTerm.why}
                </p>
              </div>
            </>
          )}
          {view.visualType === "cloud" && (
            <div className="sheet-grid">
              {Array.from({ length: 8 }, (_, i) => (
                <div className="sheet-chip" key={i}>
                  <span>dim {String(i + 1).padStart(2, "0")}</span>
                  <strong>{(Math.sin(i * 0.8) * 0.72).toFixed(2)}</strong>
                </div>
              ))}
            </div>
          )}
          {view.visualType === "json" && (
            <pre className="sheet-chip" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{`{
  "functional_status": "fully_dependent",
  "mental_status": "confused",
  "code_status": "DNR",
  "infection_source": "pulmonary",
  "substance_use": "none"
}`}</pre>
          )}
          <div className="sheet-grid">
            {view.chips.map(([label, value]) => (
              <article className="sheet-chip" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function AdjustmentStep() {
  const [mode, setMode] = useState("matching");
  const [calculatorTreatment, setCalculatorTreatment] = useState(1);
  const [calculatorPropensity, setCalculatorPropensity] = useState(0.35);
  const marginalTreatmentRate = 0.25;
  const simpleWeight = calculatorTreatment ? 1 / calculatorPropensity : 1 / (1 - calculatorPropensity);
  const stabilizedWeight = calculatorTreatment
    ? marginalTreatmentRate / calculatorPropensity
    : (1 - marginalTreatmentRate) / (1 - calculatorPropensity);
  return (
    <div className="two-up two-up--dense">
      <div className="prose">
        {mode === "matching" ? (
          <>
            <p>
              Matching keeps treated and untreated labels fixed, then chooses which untreated patients are credible
              comparisons.
            </p>
            <p>
              Use the patient chips below to see how matching prunes the comparison set. The adjustment comes from
              changing who is compared, not from changing who was treated.
            </p>
          </>
        ) : (
          <div className="weighting-explainer">
            <p>
              Weighting keeps everyone, but changes how strongly each patient counts. The key idea is simple:
              patients who received a treatment that was <strong>unlikely given their baseline profile</strong> get more
              influence, because they are more informative for fair comparison.
            </p>
            <div className="formula-stack">
              <article className="formula-card">
                <span>Simple treated weight</span>
                <strong>1 / propensity</strong>
              </article>
              <article className="formula-card">
                <span>Simple untreated weight</span>
                <strong>1 / (1 - propensity)</strong>
              </article>
              <article className="formula-card">
                <span>Paper-style stabilized idea</span>
                <strong>group rate / assigned probability</strong>
              </article>
            </div>
            <p>
              Example: if a patient was treated even though their treatment probability was only 0.20, they get a
              larger weight than a patient who was treated with probability 0.90. The paper then stabilizes and trims
              extreme weights so a few unusual patients do not dominate the estimate.
            </p>
            <div className="weighting-calculator">
              <div className="weighting-calculator__controls">
                <div className="segmented-control" role="tablist" aria-label="Calculator treatment status">
                  <button
                    className={calculatorTreatment === 1 ? "is-active" : ""}
                    onClick={() => setCalculatorTreatment(1)}
                    type="button"
                  >
                    Treated
                  </button>
                  <button
                    className={calculatorTreatment === 0 ? "is-active" : ""}
                    onClick={() => setCalculatorTreatment(0)}
                    type="button"
                  >
                    Untreated
                  </button>
                </div>
                <label className="weighting-calculator__slider">
                  <span>Propensity score: {calculatorPropensity.toFixed(2)}</span>
                  <input
                    type="range"
                    min="0.05"
                    max="0.95"
                    step="0.01"
                    value={calculatorPropensity}
                    onChange={(event) => setCalculatorPropensity(Number(event.target.value))}
                  />
                </label>
              </div>
              <div className="sheet-grid">
                <article className="sheet-chip">
                  <span>Simple IPW</span>
                  <strong>{simpleWeight.toFixed(2)}</strong>
                </article>
                <article className="sheet-chip">
                  <span>Stabilized weight</span>
                  <strong>{stabilizedWeight.toFixed(2)}</strong>
                </article>
                <article className="sheet-chip">
                  <span>Why it changes</span>
                  <strong>{calculatorTreatment ? "Rare treated cases count more" : "Rare untreated cases count more"}</strong>
                </article>
              </div>
              <p className="viz-caption">
                With treatment rate fixed at {marginalTreatmentRate.toFixed(2)}, this patient is{" "}
                {calculatorTreatment ? "treated" : "untreated"} and had propensity {calculatorPropensity.toFixed(2)}.
                Simple IPW gives {simpleWeight.toFixed(2)}. Stabilization reduces that to {stabilizedWeight.toFixed(2)}.
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="viz-card">
        <div className="segmented-control" role="tablist" aria-label="Adjustment mechanism">
          <button className={mode === "matching" ? "is-active" : ""} onClick={() => setMode("matching")} type="button">
            Matching
          </button>
          <button className={mode === "weighting" ? "is-active" : ""} onClick={() => setMode("weighting")} type="button">
            Weighting
          </button>
        </div>
        <div id="adjustment-lab">
          {mode === "matching" ? (
            <>
              <div className="lab-grid">
                <div className="lab-column">
                  <h3>Treated patients</h3>
                  {matchingData.treated.map((item, index) => (
                    <article className="lab-match" key={item.id}>
                      <strong>{item.id}</strong>
                      <span>
                        propensity {item.ps.toFixed(2)}, severity {item.severity}, {item.outcome}
                      </span>
                      <span>matched with {matchingData.control[index].id}</span>
                    </article>
                  ))}
                </div>
                <div className="lab-column">
                  <h3>Untreated candidates</h3>
                  {matchingData.control.map((item) => (
                    <article
                      className="lab-match"
                      key={item.id}
                      style={{
                        opacity: item.match ? 1 : 0.42,
                        background: item.match
                          ? "color-mix(in oklab, var(--teal-soft) 46%, white)"
                          : "color-mix(in oklab, var(--bg) 80%, white)",
                      }}
                    >
                      <strong>{item.id}</strong>
                      <span>
                        propensity {item.ps.toFixed(2)}, severity {item.severity}, {item.outcome}
                      </span>
                      <span>{item.match ? "retained in matched analysis" : "dropped as poor comparison"}</span>
                    </article>
                  ))}
                </div>
              </div>
              <p className="viz-caption">
                Matching prunes the untreated comparison set. The labels stay fixed, but only credible controls remain
                in the adjusted analysis.
              </p>
            </>
          ) : (
            <>
              <div className="lab-grid">
                <div className="lab-column">
                  <h3>All patients kept</h3>
                  {weightingData.map((item) => (
                    <article className="lab-weight" key={item.id}>
                      <div className="patient-pill__meta">
                        <strong>{item.id}</strong>
                        <span>{item.treated ? "treated" : "untreated"}</span>
                      </div>
                      <span>
                        propensity {item.ps.toFixed(2)}, {item.outcome}
                      </span>
                      <div className="lab-weight__bar">
                        <span style={{ width: `${Math.min(100, item.weight * 60)}%` }}></span>
                      </div>
                      <span>analysis weight {item.weight.toFixed(1)}</span>
                    </article>
                  ))}
                </div>
              </div>
              <p className="viz-caption">
                Weighting changes influence instead of pruning rows. Patients with unusual treatment decisions for
                their baseline profile can count more strongly.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function HammingTieBreakStep() {
  const [candidateId, setCandidateId] = useState(hammingExample.candidates[0].id);
  const featureLabels = [
    ["functionalStatus", "Functional status"],
    ["mentalStatus", "Mental status"],
    ["codeStatus", "Code status"],
    ["infectionSource", "Infection source"],
    ["substanceUse", "Substance use"],
  ];

  const candidatesWithDistance = hammingExample.candidates.map((candidate) => {
    const mismatches = featureLabels.filter(
      ([key]) => candidate.features[key] !== hammingExample.treated.features[key]
    );
    return {
      ...candidate,
      mismatches,
      distance: mismatches.length,
    };
  });

  const bestDistance = Math.min(...candidatesWithDistance.map((candidate) => candidate.distance));
  const selectedCandidate = candidatesWithDistance.find((candidate) => candidate.id === candidateId);
  const bestCandidate = candidatesWithDistance.find((candidate) => candidate.distance === bestDistance);

  return (
    <div className="two-up two-up--dense">
      <div className="prose">
        <p>
          M5 is not a brand-new causal estimator. It starts with the same structured matching idea: first find a small
          pool of untreated patients whose <strong>propensity scores are already close</strong>.
        </p>
        <p>
          Then it uses the five extracted note covariates as a tie-break. <strong>Hamming distance</strong> is simply
          the number of note-category mismatches between the treated patient and each candidate control.
        </p>
        <div className="formula-stack">
          <article className="formula-card">
            <span>Structured stage</span>
            <strong>Keep only close propensity-score controls</strong>
          </article>
          <article className="formula-card">
            <span>Hamming distance</span>
            <strong>Count how many extracted categories disagree</strong>
          </article>
          <article className="formula-card">
            <span>M5 tie-break</span>
            <strong>Pick the control with the smallest mismatch count</strong>
          </article>
        </div>
        <p>
          Here, treated patient <strong>{hammingExample.treated.id}</strong> has propensity{" "}
          <strong>{hammingExample.treated.ps.toFixed(2)}</strong>. All three controls below are close enough on
          structured propensity score to remain candidates. M5 then asks which one tells the most similar note-based
          patient story.
        </p>
        <div className="viz-card hamming-summary-card">
          <strong>How to read the number</strong>
          <p>
            Distance <strong>0</strong> means all five note covariates match. Distance <strong>1</strong> means one
            mismatch. Distance <strong>3</strong> means the control may look numerically close, but the note-derived
            baseline picture is drifting away.
          </p>
        </div>
      </div>
      <div className="viz-card">
        <div className="segmented-control segmented-control--wrap" role="tablist" aria-label="Candidate controls for M5 tie-break">
          {candidatesWithDistance.map((candidate) => (
            <button
              className={candidate.id === candidateId ? "is-active" : ""}
              onClick={() => setCandidateId(candidate.id)}
              type="button"
              key={candidate.id}
            >
              {candidate.id}: {candidate.distance} mismatch{candidate.distance === 1 ? "" : "es"}
            </button>
          ))}
        </div>
        <div className="hamming-lab">
          <div className="hamming-lab__summary">
            {candidatesWithDistance.map((candidate) => (
              <article
                className={`hamming-score-card${candidate.distance === bestDistance ? " is-best" : ""}${
                  candidate.id === candidateId ? " is-selected" : ""
                }`}
                key={candidate.id}
              >
                <span>{candidate.id}</span>
                <strong>{candidate.distance}</strong>
                <small>{candidate.ps.toFixed(2)} PS</small>
              </article>
            ))}
          </div>
          <div className="hamming-lab__columns">
            <article className="hamming-profile">
              <span className="hamming-profile__eyebrow">treated reference</span>
              <h3>
                {hammingExample.treated.id} <small>propensity {hammingExample.treated.ps.toFixed(2)}</small>
              </h3>
              <p>{hammingExample.treated.note}</p>
              <div className="hamming-pill-grid">
                {featureLabels.map(([key, label]) => (
                  <div className="hamming-pill is-match" key={key}>
                    <span>{label}</span>
                    <strong>{hammingExample.treated.features[key]}</strong>
                  </div>
                ))}
              </div>
            </article>
            <article className="hamming-profile">
              <span className="hamming-profile__eyebrow">candidate control</span>
              <h3>
                {selectedCandidate.id} <small>propensity {selectedCandidate.ps.toFixed(2)}</small>
              </h3>
              <p>
                Structured stage says this control is close. The tie-break checks whether the extracted note categories
                line up with the treated patient.
              </p>
              <div className="hamming-pill-grid">
                {featureLabels.map(([key, label]) => {
                  const mismatch = selectedCandidate.features[key] !== hammingExample.treated.features[key];
                  return (
                    <div className={`hamming-pill${mismatch ? " is-mismatch" : " is-match"}`} key={key}>
                      <span>{label}</span>
                      <strong>{selectedCandidate.features[key]}</strong>
                    </div>
                  );
                })}
              </div>
            </article>
          </div>
          <div className="hamming-table" role="table" aria-label="Hamming mismatch comparison">
            {featureLabels.map(([key, label]) => {
              const mismatch = selectedCandidate.features[key] !== hammingExample.treated.features[key];
              return (
                <div className={`hamming-row${mismatch ? " is-mismatch" : " is-match"}`} key={key}>
                  <span>{label}</span>
                  <strong>{hammingExample.treated.features[key]}</strong>
                  <strong>{selectedCandidate.features[key]}</strong>
                  <em>{mismatch ? "different" : "same"}</em>
                </div>
              );
            })}
          </div>
          <p className="viz-caption">
            Hamming distance for <strong>{selectedCandidate.id}</strong> is <strong>{selectedCandidate.distance}</strong>.
            {selectedCandidate.distance === 0
              ? " All five extracted covariates match, so this control wins the tie-break."
              : ` ${selectedCandidate.distance} of the five extracted covariates differ.`}{" "}
            {selectedCandidate.distance === bestDistance
              ? `M5 would keep ${selectedCandidate.id} ahead of the other close controls.`
              : `M5 would prefer ${bestCandidate.id}, which has the smaller distance of ${bestDistance}.`}
          </p>
        </div>
      </div>
    </div>
  );
}

function ResultsChart({ expanded = false }) {
  const width = expanded ? 1180 : 760;
  const height = expanded ? 560 : 420;
  const left = expanded ? 420 : 240;
  const right = expanded ? 70 : 40;
  const top = expanded ? 38 : 32;
  const bottom = expanded ? 56 : 44;
  const innerW = width - left - right;
  const rowH = expanded ? 58 : 44;
  const maxX = 0.09;
  const x = (value) => left + (value / maxX) * innerW;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Paper treatment effect estimates">
      <text className={`chart-label ${expanded ? "chart-label--expanded" : ""}`} x={left} y={expanded ? "22" : "18"}>
        Adjusted 28-day mortality difference, treated minus untreated
      </text>
      {Array.from({ length: 10 }, (_, i) => {
        const value = (maxX / 9) * i;
        const xpos = x(value);
        return (
          <g key={i}>
            <line className="chart-line" x1={xpos} x2={xpos} y1={top} y2={height - bottom} />
            <text className={`chart-subtle ${expanded ? "chart-subtle--expanded" : ""}`} x={xpos} y={height - 20} textAnchor="middle">
              {(value * 100).toFixed(1)}%
            </text>
          </g>
        );
      })}
      {paperResults.map((row, index) => {
        const cy = top + 32 + index * rowH;
        const color = toneColor(row.tone);
        return (
          <g key={row.method}>
            <text className={`chart-label ${expanded ? "chart-label--expanded" : ""}`} x="20" y={cy + 6}>
              {row.method}
            </text>
            {expanded ? (
              <text className="chart-subtle chart-subtle--method-expanded" x="120" y={cy - 4}>
                {row.expandedLabelLines.map((line, lineIndex) => (
                  <tspan key={line} x="120" dy={lineIndex === 0 ? 0 : 18}>
                    {line}
                  </tspan>
                ))}
              </text>
            ) : (
              <text className="chart-subtle chart-subtle--method" x="64" y={cy + 4}>
                {row.label}
              </text>
            )}
            <line
              x1={x(row.low)}
              x2={x(row.high)}
              y1={cy}
              y2={cy}
              stroke={color}
              strokeWidth={expanded ? "8" : "6"}
              strokeLinecap="round"
            />
            <circle cx={x(row.effect)} cy={cy} r={expanded ? "11" : "8"} fill={color} />
            <text className={`chart-subtle ${expanded ? "chart-subtle--expanded" : ""}`} x={x(row.high) + 14} y={cy + 6}>
              +{(row.effect * 100).toFixed(1)}pp
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SimulationChart() {
  const [viewKey, setViewKey] = useState("benefit");
  const view = simulationViews[viewKey];
  const width = 760;
  const height = 420;
  const left = 130;
  const right = 28;
  const top = 62;
  const bottom = 64;
  const innerW = width - left - right;
  const maxValue = Math.max(...view.bars.map((b) => b.value)) * 1.2;
  const x = (value) => left + (value / maxValue) * innerW;
  const barH = 34;
  const gap = 18;
  return (
    <div className="viz-card viz-card--chart">
      <div className="segmented-control" role="tablist" aria-label="Simulation view">
        <button className={viewKey === "benefit" ? "is-active" : ""} onClick={() => setViewKey("benefit")} type="button">
          Benefit world
        </button>
        <button className={viewKey === "null" ? "is-active" : ""} onClick={() => setViewKey("null")} type="button">
          Null world
        </button>
        <button className={viewKey === "noise" ? "is-active" : ""} onClick={() => setViewKey("noise")} type="button">
          Noise stress test
        </button>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Semi-synthetic paper results">
        <text className="chart-label" x={left} y="20">
          {view.title}
        </text>
        <text className="chart-subtle" x={left} y="42">
          {view.caption}
        </text>
        {Array.from({ length: 5 }, (_, i) => {
          const value = (maxValue / 4) * i;
          const xpos = x(value);
          return (
            <g key={i}>
              <line className="chart-line" x1={xpos} x2={xpos} y1={top} y2={height - bottom} />
              <text className="chart-subtle" x={xpos} y={height - 20} textAnchor="middle">
                {value.toFixed(3)}
              </text>
            </g>
          );
        })}
        {view.bars.map((bar, index) => {
          const y = top + index * (barH + gap);
          const color = toneColor(bar.tone);
          return (
            <g key={bar.method}>
              <text className="chart-label" x="16" y={y + 22}>
                {bar.method}
              </text>
              <rect x={left} y={y} width={x(bar.value) - left} height={barH} rx="14" fill={color} opacity="0.84" />
              <text className="chart-subtle" x={x(bar.value) + 10} y={y + 22}>
                {bar.value.toFixed(4)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function App() {
  const { visibleSteps, activeStep } = useVisibleSteps();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [expandedChart, setExpandedChart] = useState(null);

  useEffect(() => {
    document.body.classList.toggle("reduced-motion", reducedMotion);
    return () => document.body.classList.remove("reduced-motion");
  }, [reducedMotion]);

  useEffect(() => {
    if (!expandedChart) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setExpandedChart(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedChart]);

  const isVisible = (id) => visibleSteps.has(id);

  return (
    <div className="page-shell">
      <Hero reducedMotion={reducedMotion} onToggleMotion={() => setReducedMotion((value) => !value)} />
      <main id="story" className="story-layout">
        <StoryNav activeStep={activeStep} />
        <section className="story-content">
          <StepShell
            id="step-1"
            kicker="Step 1"
            title="The question is not prediction, it is a fair comparison"
            visible={isVisible("step-1")}
            current={activeStep === "step-1"}
            intro
          >
            <StepLedger
              have={{
                title: "The causal question only",
                body: "Early vasopressors, 28-day death, and the warning that treated patients start sicker.",
              }}
              adds={{
                title: "The fairness lens",
                body: "Why raw treated-versus-untreated death rates cannot be read as treatment effect.",
              }}
            />
            <RawVsAdjustedStep />
          </StepShell>

          <StepShell
            id="step-2"
            kicker="Steps 2 to 5"
            title="Build one clean patient-episode table around a single timeline"
            visible={isVisible("step-2")}
            current={activeStep === "step-2"}
          >
            <StepMap
              items={[
                { step: "Step 2", title: "One row per sepsis ICU episode" },
                { step: "Step 3", title: "Apply inclusion and exclusion rules" },
                { step: "Step 4", title: "Mark early vasopressor treatment" },
                { step: "Step 5", title: "Mark 28-day mortality outcome" },
              ]}
            />
            <StepLedger
              have={{ title: "A causal question", body: "No usable modeling table yet, only the study objective." }}
              adds={{
                title: "The timeline-aligned cohort row",
                body: "Eligibility, treatment, and outcome are all attached to one anchored patient episode.",
              }}
            />
            <TimelineStep />
          </StepShell>

          <StepShell
            id="step-3"
            kicker="Steps 6 and 7"
            title="Structured tables explain part of the patient, notes explain the rest"
            visible={isVisible("step-3")}
            current={activeStep === "step-3"}
          >
            <StepMap
              items={[
                { step: "Step 6", title: "Add structured pre-treatment state" },
                { step: "Step 7", title: "Attach note text" },
              ]}
            />
            <StepLedger
              have={{
                title: "An eligible cohort with treatment and outcome labels",
                body: "We know what happened, but not enough yet about who the patients were before treatment.",
              }}
              adds={{
                title: "Patient state from tables and narrative",
                body: "Vitals, labs, severity, plus the note language that often contains frailty, code status, or source clues.",
              }}
            />
            <RevealStep />
          </StepShell>

          <StepShell
            id="step-4"
            kicker="Steps 8 to 10"
            title="Three ways to turn a note into model-ready information"
            visible={isVisible("step-4")}
            current={activeStep === "step-4"}
          >
            <StepMap
              items={[
                { step: "Step 8", title: "TF-IDF words" },
                { step: "Step 9", title: "Embeddings and PCA" },
                { step: "Step 10", title: "LLM-extracted covariates" },
              ]}
            />
            <StepLedger
              have={{
                title: "Rows with note text attached",
                body: "The site now has raw note language, but the model still needs a usable numeric or categorical representation.",
              }}
              adds={{
                title: "Three competing note encodings",
                body: "Literal words, dense semantic vectors, or a small interpretable set of extracted patient descriptors.",
              }}
            />
            <MethodStep />
          </StepShell>

          <StepShell
            id="step-5"
            kicker="Steps 11 to 14"
            title="Adjustment changes the comparison, not the patient labels"
            visible={isVisible("step-5")}
            current={activeStep === "step-5"}
          >
            <StepMap
              items={[
                { step: "Step 11", title: "Propensity score matching" },
                { step: "Step 12", title: "M1, M2, M3" },
                { step: "Step 13", title: "M4, M5, M6" },
                { step: "Step 14", title: "M7 and balance checks" },
              ]}
            />
            <StepLedger
              have={{
                title: "Patient rows plus several note representations",
                body: "The features exist, but we still need a way to compare treated and untreated patients fairly.",
              }}
              adds={{
                title: "The adjustment machinery",
                body: "Propensity scores, matching, weighting, and the paper's seven methods built from different covariate sets.",
              }}
            />
            <AdjustmentStep />
          </StepShell>

          <StepShell
            id="step-6"
            kicker="Step 13, zoomed in"
            title="M5 refines structured matches with a Hamming-distance tie-break"
            visible={isVisible("step-6")}
            current={activeStep === "step-6"}
          >
            <StepLedger
              have={{
                title: "A pool of controls already close on structured propensity score",
                body: "The first-stage matching has already narrowed the untreated side to patients who look numerically plausible.",
              }}
              adds={{
                title: "A note-level tie-break",
                body: "M5 counts mismatches across the five extracted note covariates and keeps the smallest Hamming distance.",
              }}
            />
            <HammingTieBreakStep />
          </StepShell>

          <StepShell
            id="step-7"
            kicker="Step 15"
            title="Read the treatment-effect table as a family of adjusted stories"
            visible={isVisible("step-7")}
            current={activeStep === "step-7"}
          >
            <StepLedger
              have={{
                title: "Adjusted comparisons from M1 to M7",
                body: "Each method has built a fairer comparison in its own way.",
              }}
              adds={{
                title: "The effect estimate itself",
                body: "How much higher or lower the adjusted 28-day mortality risk looks in treated patients.",
              }}
            />
            <div className="two-up">
              <div className="prose">
                <p>
                  Each method outputs an adjusted difference in 28-day mortality risk. Smaller is not automatically
                  better: the estimate must be read together with balance, because the best method is the one that makes
                  treated and untreated patients more comparable first.
                </p>
                <div className="formula-stack">
                  <article className="formula-card">
                    <span>What “pp” means</span>
                    <strong>percentage points</strong>
                  </article>
                  <article className="formula-card">
                    <span>How it is calculated</span>
                    <strong>treated risk − untreated risk</strong>
                  </article>
                </div>
                <p>
                  Example: if the adjusted treated death risk is 20% and the adjusted untreated death risk is 14.5%,
                  the difference is <strong>20.0% − 14.5% = 5.5 percentage points</strong>, written as
                  <strong> 5.5pp</strong>. So `M1 = 5.5pp` means the treated group&apos;s adjusted 28-day mortality was
                  5.5 percentage points higher than the untreated group&apos;s.
                </p>
                <div className="weighting-calculator">
                  <div>
                    <h3>Why authors can prefer M4 even though M4 has more pp than M2</h3>
                    <p>
                      Because the paper is not ranking methods by <strong>smallest effect size</strong>. It is ranking
                      them by <strong>how believable the adjusted comparison is</strong>. A method can output a tiny
                      number simply because it adjusted badly or over-corrected. The authors trust methods that make
                      treated and untreated groups look more alike on baseline characteristics and then perform better
                      in semi-synthetic tests where the true answer is known.
                    </p>
                  </div>
                  <div className="formula-stack">
                    <article className="formula-card">
                      <span>M2 in the paper</span>
                      <strong>+0.8pp</strong>
                    </article>
                    <article className="formula-card">
                      <span>M4 in the paper</span>
                      <strong>+2.7pp</strong>
                    </article>
                    <article className="formula-card">
                      <span>What the authors care about</span>
                      <strong>Balance and bias, not smallest pp</strong>
                    </article>
                  </div>
                  <p>
                    In plain language: a tiny `pp` can look comforting, but if treated and untreated patients are still
                    not comparable, that tiny number is not more trustworthy. The paper argues that `M4` does a better
                    job aligning the groups before computing the effect.
                  </p>
                  <div className="sheet-grid">
                    <article className="sheet-chip">
                      <span>Real-data balance, M4</span>
                      <strong>mean SMD 0.014</strong>
                    </article>
                    <article className="sheet-chip">
                      <span>Worst remaining imbalance, M4</span>
                      <strong>max SMD 0.042</strong>
                    </article>
                    <article className="sheet-chip">
                      <span>Balanced variables, M4</span>
                      <strong>26 / 26 under 0.1</strong>
                    </article>
                  </div>
                  <article className="sheet-chip">
                    <span>Worked toy example, why bigger pp can still be better</span>
                    <strong style={{ fontSize: "1rem", lineHeight: "1.6", fontWeight: 600 }}>
                      Suppose Method A gives +0.8pp but still leaves treated patients much sicker than controls, for
                      example average baseline severity 9.5 vs 6.8. Suppose Method B gives +2.7pp but makes the groups
                      truly comparable, for example 9.1 vs 9.0. Method B&apos;s number is larger, but it is based on a
                      fairer comparison, so it is more believable.
                    </strong>
                  </article>
                  <p className="viz-caption">
                    For the paper, this is exactly why `M4` matters: not because `2.7pp` is numerically small, but
                    because `M4` both improves balance strongly on real data and reduces bias strongly in the
                    semi-synthetic experiments.
                  </p>
                </div>
              </div>
              <div className="viz-card viz-card--chart">
                <div className="viz-card__toolbar">
                  <button className="icon-button" onClick={() => setExpandedChart("results")} type="button" aria-label="Expand chart">
                    ⤢
                  </button>
                </div>
                <ResultsChart />
              </div>
            </div>
          </StepShell>

          <StepShell
            id="step-8"
            kicker="Steps 16 to 18"
            title="Semi-synthetic experiments ask which method finds the truth when the truth is known"
            visible={isVisible("step-8")}
            current={activeStep === "step-8"}
          >
            <StepMap
              items={[
                { step: "Step 16", title: "AIPW as a robustness check" },
                { step: "Step 17", title: "Build a semi-synthetic world" },
                { step: "Step 18", title: "Measure bias, RMSE, and noise sensitivity" },
              ]}
            />
            <StepLedger
              have={{
                title: "Real-data estimates and balance diagnostics",
                body: "We know how the methods behave on actual ICU data, but real data never reveals the exact true treatment effect.",
              }}
              adds={{
                title: "A truth-controlled stress test",
                body: "The paper freezes real patient features, simulates treatment and outcome, and checks which methods recover the planted answer.",
              }}
            />
            <div className="two-up">
              <div className="prose">
                <p>
                  Real data never tells us the exact true effect. So the paper freezes real patient features, simulates
                  treatment and outcome under controlled rules, and measures which method gets closest to the planted
                  truth.
                </p>
                <p>Switch between the beneficial-treatment world, the null-effect world, and the extraction-noise stress test.</p>
              </div>
              <SimulationChart />
            </div>
          </StepShell>

          <StepShell
            id="step-9"
            kicker="Conclusion"
            title="The paper’s claim is narrow, practical, and useful"
            visible={isVisible("step-9")}
            current={activeStep === "step-9"}
            final
          >
            <StepLedger
              have={{
                title: "The full paper pipeline",
                body: "Question, cohort, notes, adjustment methods, real-data estimates, and semi-synthetic validation.",
              }}
              adds={{
                title: "The operational lesson",
                body: "If notes hide clinically relevant state, extracting a small set of interpretable covariates can beat generic text vectors for causal adjustment.",
              }}
            />
            <div className="conclusion-panel">
              <div className="conclusion-panel__summary">
                <p>
                  The paper is not saying LLMs solve causality. It is saying that when structured EHR data misses key
                  patient-state information, a <strong>small, interpretable set of note-derived covariates</strong> can
                  make observational comparisons more credible than tables alone or generic note vectors.
                </p>
              </div>
              <div className="conclusion-panel__grid">
                <article>
                  <span>What wins</span>
                  <strong>M4 direct augmentation</strong>
                </article>
                <article>
                  <span>Why it wins</span>
                  <strong>Better balance, lower bias</strong>
                </article>
                <article>
                  <span>What remains true</span>
                  <strong>Integration choice matters</strong>
                </article>
              </div>
            </div>
          </StepShell>
        </section>
      </main>
      {expandedChart === "results" && (
        <div className="modal-backdrop" onClick={() => setExpandedChart(null)} role="presentation">
          <div className="modal-panel modal-panel--chart" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Expanded treatment effect chart">
            <div className="modal-panel__header">
              <div>
                <p className="step__kicker">Expanded chart</p>
                <h3>Adjusted 28-day mortality difference</h3>
              </div>
              <button className="icon-button icon-button--close" onClick={() => setExpandedChart(null)} type="button" aria-label="Close expanded chart">
                ×
              </button>
            </div>
            <div className="modal-panel__body">
              <ResultsChart expanded />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
