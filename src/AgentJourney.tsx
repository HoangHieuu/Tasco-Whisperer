import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import {
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  CircleDashed,
  Coffee,
  GitBranch,
  Navigation,
  Play,
  RotateCcw,
  Route,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  cancelAgentTask,
  confirmAgentAction,
  createAgentTask,
  getAgentTask,
  reportAgentActionResult,
  subscribeAgentTask,
} from './lib/frontendMobilityAgent';
import type { AgentEvent, AgentTaskRequest, AgentTaskSnapshot, CandidateBundle, Coordinates, PlanStep } from './lib/mobilityAgentTypes';

const HERO_QUERY = 'Find an EV charger on my route to Đà Nẵng, near coffee, open now, with less than a 10-minute detour.';
const DEMO_ORIGIN = { lat: 10.7769, lon: 106.7009 };

interface AgentJourneyProps {
  currentLocation?: Coordinates;
  userId?: string;
}

export function AgentJourney({ currentLocation, userId }: AgentJourneyProps) {
  return (
    <AgentJourneyErrorBoundary>
      <AgentJourneyContent currentLocation={currentLocation} userId={userId} />
    </AgentJourneyErrorBoundary>
  );
}

function AgentJourneyContent({ currentLocation, userId }: AgentJourneyProps) {
  const [query, setQuery] = useState(HERO_QUERY);
  const [task, setTask] = useState<AgentTaskSnapshot>();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState('');
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => () => unsubscribeRef.current?.(), []);

  const winner = useMemo(() => task?.candidates.find((candidate) => candidate.eligible), [task?.candidates]);
  const visibleEvents = task?.events.slice(-18) ?? [];

  async function startJourney() {
    unsubscribeRef.current?.();
    setIsStarting(true);
    setError('');
    setTask(undefined);
    const request: AgentTaskRequest = {
      query,
      context: {
        currentLocation: currentLocation ?? DEMO_ORIGIN,
        now: localDateTimeWithOffset(),
        locale: 'en',
        userId: userId || 'agent-demo',
        sessionId: `agent-ui-${Date.now()}`,
        vehicle: { type: 'ev', connectorTypes: ['CCS2'] },
      },
      executionMode: 'plan-and-propose',
    };
    try {
      const created = await createAgentTask(request);
      const initial = await getAgentTask(created.taskId);
      setTask(initial);
      unsubscribeRef.current = subscribeAgentTask(created.taskId, {
        onSnapshot: setTask,
        onError: () => void getAgentTask(created.taskId).then(setTask).catch(() => setError('Agent event stream disconnected.')),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to start the agent journey.');
    } finally {
      setIsStarting(false);
    }
  }

  async function confirmAction() {
    if (!task?.proposedAction) return;
    setError('');
    try {
      const confirmed = await confirmAgentAction(task.id, task.proposedAction.id);
      setTask(confirmed);
      const completed = await reportAgentActionResult(task.id, task.proposedAction.id, true, 'Web route preview updated with the approved charging stop.');
      setTask(completed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to execute the approved action.');
    }
  }

  async function cancelJourney() {
    if (!task) return;
    try {
      setTask(await cancelAgentTask(task.id));
      unsubscribeRef.current?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to cancel the task.');
    }
  }

  return (
    <section className="agent-workspace">
      <section className="agent-hero">
        <div className="agent-kicker"><Sparkles size={15} /> Agent Journey</div>
        <div className="agent-hero-copy">
          <div>
            <h2>Three real agents. One grounded mobility action.</h2>
            <p>Separate OpenRouter model runs supervise the plan, choose and execute map tools, then independently verify the evidence before any action can be proposed.</p>
          </div>
          <div className="agent-mode-badge"><BrainCircuit size={18} /><span>Bounded autonomy</span><strong>3 agents · 20 tools · 2 replans</strong></div>
        </div>
        <label className="agent-prompt">
          <span>Ask Tasco Whisperer</span>
          <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={3} />
        </label>
        <div className="agent-context-row">
          <span><Navigation size={15} /> {currentLocation ? 'Browser location' : 'Demo origin: TP.HCM'}</span>
          <span><Zap size={15} /> EV · CCS2</span>
          <span><TimerReset size={15} /> Current local time</span>
          <button type="button" className="agent-run" onClick={startJourney} disabled={isStarting || query.trim().length < 3}>
            {isStarting ? <CircleDashed className="spin" size={17} /> : <Play size={17} />}
            {isStarting ? 'Starting agents' : task ? 'Run again' : 'Run multi-agent plan'}
          </button>
        </div>
        {error ? <div className="agent-error"><X size={15} />{error}</div> : null}
      </section>

      {task ? (
        <div className="agent-grid">
          <section className="agent-column agent-trace-card">
            <AgentSectionHeading icon={<GitBranch size={18} />} title="Live execution trace" meta={`${task.events.length} events`} />
            <div className="task-status-row">
              <span className={`task-status status-${task.status}`}>{humanStatus(task.status)}</span>
              <small>{task.modelCalls.length} model calls · {task.budgets.toolCallsUsed}/{task.budgets.toolCallLimit} tools · {task.budgets.replansUsed}/{task.budgets.replanLimit} replans</small>
            </div>
            <div className="agent-model-ledger">
              {task.modelCalls.map((call) => (
                <div className={`model-ledger-row model-${call.status}`} key={call.id}>
                  <span><BrainCircuit size={13} />{call.agent}</span>
                  <strong>{call.model}</strong>
                  <small>{call.status === 'running' ? 'running' : `${call.stepCount ?? 0} steps · ${call.toolNames.length} actions`}</small>
                </div>
              ))}
            </div>
            <div className="agent-event-list" aria-live="polite">
              {visibleEvents.map((event) => <AgentEventRow event={event} key={`${event.sequence}-${event.kind}`} />)}
            </div>
            {!['completed', 'failed', 'degraded', 'cancelled', 'ready_for_confirmation'].includes(task.status) ? (
              <button type="button" className="agent-secondary-button" onClick={cancelJourney}>Cancel task</button>
            ) : null}
          </section>

          <section className="agent-column">
            <div className="agent-card">
              <AgentSectionHeading icon={<BrainCircuit size={18} />} title="Reasoning contract" meta={`${task.constraints.filter((item) => item.importance === 'hard').length} hard`} />
              {task.goal ? <p className="agent-goal">{task.goal.summary}</p> : null}
              <div className="constraint-list">
                {task.constraints.map((constraint) => (
                  <div className={`constraint-row importance-${constraint.importance}`} key={constraint.id}>
                    <span>{constraint.importance === 'hard' ? <ShieldCheck size={14} /> : <Sparkles size={14} />}{constraint.field}</span>
                    <strong>{String(constraint.value)}</strong>
                    <small>{Math.round(constraint.confidence * 100)}%</small>
                  </div>
                ))}
              </div>
            </div>

            <div className="agent-card">
              <AgentSectionHeading icon={<Route size={18} />} title={`Plan v${task.plan?.version ?? 0}`} meta={`${task.plan?.steps.length ?? 0} steps`} />
              <div className="plan-step-list">
                {task.plan?.steps.map((step, index) => <PlanStepRow step={step} index={index} task={task} key={step.id} />)}
              </div>
            </div>
          </section>

          <section className="agent-column">
            <div className="agent-card route-proof-card">
              <AgentSectionHeading icon={<Navigation size={18} />} title="Verified recommendation" meta={winner ? `${Math.round(winner.score * 100)} score` : 'evaluating'} />
              {winner ? <CandidateResult candidate={winner} /> : <AgentEmptyState task={task} />}
            </div>

            {task.proposedAction ? (
              <div className={`agent-card action-card action-${task.proposedAction.status}`}>
                <AgentSectionHeading icon={<Zap size={18} />} title="Action gate" meta={task.proposedAction.status} />
                <h3>{task.proposedAction.label}</h3>
                <p>No route state changes until this explicit confirmation. The command is typed, expiring, and replay-protected.</p>
                {task.proposedAction.status === 'proposed' ? (
                  <button type="button" className="confirm-action" onClick={confirmAction}><Check size={17} /> Confirm and add stop</button>
                ) : task.proposedAction.status === 'completed' ? (
                  <div className="action-complete"><CheckCircle2 size={18} /> Route updated by the web executor</div>
                ) : (
                  <div className="action-complete"><CircleDashed className="spin" size={18} /> {task.proposedAction.status}</div>
                )}
              </div>
            ) : null}
          </section>
        </div>
      ) : (
        <AgentLanding />
      )}
    </section>
  );
}

class AgentJourneyErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Agent Journey render failure', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <section className="agent-workspace">
        <div className="agent-crash-card" role="alert">
          <X size={24} />
          <div>
            <strong>Agent Journey could not display this task</strong>
            <p>{this.state.error.message || 'The API returned an incompatible task snapshot.'}</p>
          </div>
          <button type="button" onClick={() => this.setState({ error: undefined })}>Return to Agent Journey</button>
        </div>
      </section>
    );
  }
}

function AgentLanding() {
  const agents = ['Supervisor Agent', 'Mobility Executor Agent', 'Verifier & Action Agent'];
  return (
    <section className="agent-landing">
      <div className="agent-network-visual">
        <div className="network-core"><Bot size={34} /><strong>3-agent runtime</strong><span>separate model runs</span></div>
        {agents.map((agent, index) => <div className={`network-node node-${index + 1}`} key={agent}><span>{index + 1}</span>{agent}</div>)}
      </div>
      <div className="agent-landing-copy">
        <span className="eyebrow">Not role labels around fixed code</span>
        <h3>Every agent reasons, selects an action, and is independently bounded.</h3>
        <p>The Supervisor designs the plan. The Executor selects and sequences real map tools. The Verifier inspects evidence and may approve, replan, or safely refuse—through a separate model call.</p>
        <div className="agent-proof-grid">
          <div><Wrench size={18} /><strong>Model-selected tools</strong><span>Search, route, nearby, hours, memory</span></div>
          <div><RotateCcw size={18} /><strong>Bounded replanning</strong><span>Failures change the next step, not the facts</span></div>
          <div><ShieldCheck size={18} /><strong>Evidence first</strong><span>Source and confidence on every claim</span></div>
        </div>
      </div>
    </section>
  );
}

function AgentSectionHeading({ icon, title, meta }: { icon: React.ReactNode; title: string; meta: string }) {
  return <div className="agent-section-heading"><span>{icon}{title}</span><small>{meta}</small></div>;
}

function AgentEventRow({ event }: { event: AgentEvent }) {
  return (
    <article className={`agent-event event-${event.kind}`}>
      <div className="event-sequence">{String(event.sequence).padStart(2, '0')}</div>
      <div><strong>{event.agent}</strong><p>{event.message}</p>{event.detail ? <small>{event.detail}</small> : null}</div>
    </article>
  );
}

function PlanStepRow({ step, index, task }: { step: PlanStep; index: number; task: AgentTaskSnapshot }) {
  const executed = task.toolCalls.some((call) => call.tool === step.tool && call.status === 'completed');
  const active = task.toolCalls.some((call) => call.tool === step.tool && call.status === 'running');
  return (
    <div className={executed ? 'plan-step is-complete' : active ? 'plan-step is-active' : 'plan-step'}>
      <span>{executed ? <Check size={14} /> : index + 1}</span>
      <div><strong>{step.agent}</strong><p>{step.description}</p><small>{step.tool ?? 'agent handoff'} · on failure: {step.failurePolicy}</small></div>
    </div>
  );
}

function CandidateResult({ candidate }: { candidate: CandidateBundle }) {
  return (
    <>
      <RouteSketch candidate={candidate} />
      <div className="candidate-title"><div className="candidate-icon"><Zap size={20} /></div><div><h3>{candidate.primary.label}</h3><p>{candidate.primary.address}</p></div></div>
      <div className="candidate-metrics">
        <div><strong>{(candidate.detourSeconds / 60).toFixed(1)} min</strong><span>added travel</span></div>
        <div><strong>{candidate.openNow ? 'Open' : 'Unknown'}</strong><span>{candidate.primary.openingHours}</span></div>
        <div><strong>{candidate.nearbyAmenities.length ? '250 m' : '—'}</strong><span>coffee nearby</span></div>
      </div>
      {candidate.nearbyAmenities[0] ? <div className="nearby-proof"><Coffee size={16} /><span><strong>{candidate.nearbyAmenities[0].label}</strong> · {candidate.nearbyAmenities[0].address}</span></div> : null}
      <div className="verification-list">
        {candidate.constraintResults.map((result) => <div className={`verification-row verify-${result.status}`} key={result.constraintId}><span>{result.status === 'pass' ? <Check size={13} /> : <X size={13} />}{result.constraintId}</span><small>{result.evidence}</small></div>)}
      </div>
      <div className="provenance-strip"><ShieldCheck size={14} /> {candidate.primary.source} · {Math.round(candidate.primary.confidence * 100)}% evidence confidence · route {candidate.route.source}</div>
    </>
  );
}

function RouteSketch({ candidate }: { candidate: CandidateBundle }) {
  return (
    <div className="route-sketch" aria-label="Route preview with charging stop">
      <svg viewBox="0 0 420 120" role="img">
        <path d="M18 88 C 92 18, 164 102, 235 48 S 344 26, 402 52" fill="none" stroke="#cdd8d1" strokeWidth="13" strokeLinecap="round" />
        <path d="M18 88 C 92 18, 164 102, 235 48 S 344 26, 402 52" fill="none" stroke="#188451" strokeWidth="4" strokeLinecap="round" strokeDasharray="8 8" />
        <circle cx="18" cy="88" r="8" fill="#27627a" stroke="white" strokeWidth="4" />
        <circle cx="235" cy="48" r="11" fill="#d99017" stroke="white" strokeWidth="5" />
        <circle cx="402" cy="52" r="8" fill="#188451" stroke="white" strokeWidth="4" />
      </svg>
      <span className="route-origin">TP.HCM</span><span className="route-stop">{candidate.primary.label}</span><span className="route-destination">Đà Nẵng</span>
    </div>
  );
}

function AgentEmptyState({ task }: { task: AgentTaskSnapshot }) {
  return (
    <div className="agent-empty-state">
      {task.status === 'needs_clarification' ? <><BrainCircuit size={28} /><strong>Clarification required</strong><p>{task.clarification?.question}</p></> : task.status === 'degraded' ? <><X size={28} /><strong>No safe result</strong><p>{task.finalMessage}</p></> : <><CircleDashed className="spin" size={28} /><strong>Agents are evaluating candidates</strong><p>Hard constraints are checked before personalization or action proposals.</p></>}
    </div>
  );
}

function humanStatus(status: AgentTaskSnapshot['status']): string {
  return status.replaceAll('_', ' ');
}

function localDateTimeWithOffset(date = new Date()): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;
}
