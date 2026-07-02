import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Clock3,
  Compass,
  Database,
  MapPin,
  Radar,
  Search,
  Sparkles,
  Tags,
} from 'lucide-react';
import { browserDataset } from './lib/browserDataset';
import { evaluateDataset } from './lib/evaluate';
import { suggest } from './lib/engine';
import type { QueryEntity, Suggestion } from './lib/types';

const demoQueries = [
  'vin',
  'cafe',
  'caphe',
  'atm',
  'nguyen h',
  'ben th',
  'ks d',
  'bv bach',
  'cay x',
  'pho th',
  'coffee near',
  'q1 cafe',
  'vincom dong k',
];

const profileOptions = [
  { id: '', label: 'No profile' },
  { id: 'coffee-loyal', label: 'Coffee loyalist' },
  { id: 'danang-traveler', label: 'Da Nang traveler' },
  { id: 'commuter', label: 'Daily commuter' },
];

function App() {
  const [query, setQuery] = useState('cafe');
  const [city, setCity] = useState('');
  const [userId, setUserId] = useState('');
  const [debug, setDebug] = useState(true);

  const response = useMemo(
    () => suggest(browserDataset, { q: query, city: city || undefined, userId: userId || undefined, limit: 8 }),
    [city, query, userId],
  );
  const evaluation = useMemo(() => evaluateDataset(browserDataset), []);
  const selected = response.suggestions[0];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <MapPin size={21} strokeWidth={2.4} />
          </div>
          <div>
            <h1>Tasco Whisperer</h1>
            <p>Vietnamese autocomplete for T Maps</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className={debug ? 'toggle is-on' : 'toggle'} onClick={() => setDebug((value) => !value)}>
            <Activity size={16} />
            Debug
          </button>
          <div className="status-pill">
            <span />
            Local engine
          </div>
        </div>
      </header>

      <section className="workspace">
        <aside className="examples-panel">
          <div className="panel-heading">
            <Compass size={18} />
            <span>Demo queries</span>
          </div>
          <div className="query-list">
            {demoQueries.map((item) => (
              <button
                className={query === item ? 'query-chip active' : 'query-chip'}
                key={item}
                onClick={() => setQuery(item)}
              >
                <span>{item}</span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
          <div className="dataset-card">
            <Database size={17} />
            <div>
              <strong>{response.diagnostics.datasetRows.evaluationCases} public cases</strong>
              <span>{response.diagnostics.datasetRows.pois} POIs, {response.diagnostics.datasetRows.autocomplete} pairs</span>
            </div>
          </div>
        </aside>

        <section className="search-panel">
          <div className="map-strip" aria-hidden="true">
            <span className="route route-a" />
            <span className="route route-b" />
            <span className="pin pin-a" />
            <span className="pin pin-b" />
          </div>

          <div className="search-card">
            <label htmlFor="search-prefix">Search prefix</label>
            <div className="search-input-wrap">
              <Search size={21} />
              <input
                id="search-prefix"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try cafe, atm, ks d..."
                autoComplete="off"
              />
            </div>
            <div className="filters">
              <label>
                City
                <select value={city} onChange={(event) => setCity(event.target.value)}>
                  <option value="">Any city</option>
                  <option value="TP.HCM">TP.HCM</option>
                  <option value="Hà Nội">Hà Nội</option>
                  <option value="Đà Nẵng">Đà Nẵng</option>
                  <option value="Nha Trang">Nha Trang</option>
                </select>
              </label>
              <label>
                Profile
                <select value={userId} onChange={(event) => setUserId(event.target.value)}>
                  {profileOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="suggestion-list" aria-live="polite">
            {response.suggestions.map((suggestion, index) => (
              <SuggestionRow key={`${suggestion.id}-${suggestion.text}`} index={index} suggestion={suggestion} debug={debug} />
            ))}
          </div>
        </section>

        <aside className="analysis-panel">
          <div className="metric-grid">
            <Metric icon={<Radar size={18} />} label="Intent" value={response.intent.type} sub={`${Math.round(response.intent.confidence * 100)}% confidence`} />
            <Metric
              icon={<Clock3 size={18} />}
              label="Latency"
              value={`${response.latencyMs} ms`}
              sub={response.diagnostics.agentic.triggered ? 'validated rewrite path' : 'local deterministic path'}
            />
            <Metric icon={<BarChart3 size={18} />} label="Top-3 recall" value={`${Math.round(evaluation.summary.top3Recall * 100)}%`} sub="public evaluation" />
            <Metric icon={<Tags size={18} />} label="Intent accuracy" value={`${Math.round(evaluation.summary.intentAccuracy * 100)}%`} sub="public labels" />
          </div>

          <section className="analysis-section">
            <div className="panel-heading">
              <Sparkles size={18} />
              <span>Query understanding</span>
            </div>
            <dl className="kv-list">
              <div>
                <dt>Normalized</dt>
                <dd>{response.normalizedQuery || 'empty'}</dd>
              </div>
              <div>
                <dt>Expanded</dt>
                <dd>{response.expandedQuery || 'empty'}</dd>
              </div>
              <div>
                <dt>Expansions</dt>
                <dd>{response.diagnostics.expansions.length ? response.diagnostics.expansions.join(', ') : 'none'}</dd>
              </div>
              <div>
                <dt>Agentic correction</dt>
                <dd>
                  {response.diagnostics.agentic.triggered
                    ? `${response.diagnostics.agentic.source ?? response.diagnostics.agentic.provider}: ${
                        response.diagnostics.agentic.appliedRewrite ?? response.diagnostics.agentic.reason
                      }`
                    : response.diagnostics.agentic.reason}
                </dd>
              </div>
            </dl>
            {debug && response.diagnostics.agentic.proposal ? (
              <div className="agentic-evidence">
                <strong>{Math.round(response.diagnostics.agentic.proposal.confidence * 100)}% rewrite confidence</strong>
                <span>{response.diagnostics.agentic.proposal.evidence.join(' ')}</span>
              </div>
            ) : null}
            <div className="entity-list">
              {response.diagnostics.entities.length ? (
                response.diagnostics.entities.map((entity) => <EntityChip entity={entity} key={`${entity.kind}-${entity.value}`} />)
              ) : (
                <span className="empty-chip">No entities</span>
              )}
            </div>
          </section>

          {selected ? (
            <section className="analysis-section">
              <div className="panel-heading">
                <BarChart3 size={18} />
                <span>Score factors</span>
              </div>
              <div className="factor-list">
                {Object.entries(selected.metadata.factors).map(([name, value]) => (
                  <div className="factor" key={name}>
                    <span>{name}</span>
                    <div>
                      <i style={{ width: `${Math.round(value * 100)}%` }} />
                    </div>
                    <strong>{Math.round(value * 100)}</strong>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </section>
    </main>
  );
}

function EntityChip({ entity }: { entity: QueryEntity }) {
  return (
    <span className="entity-chip" title={`${entity.source}, ${Math.round(entity.confidence * 100)}% confidence`}>
      <strong>{entity.kind}</strong>
      {entity.value}
    </span>
  );
}

function SuggestionRow({ suggestion, index, debug }: { suggestion: Suggestion; index: number; debug: boolean }) {
  return (
    <article className="suggestion-row">
      <div className="rank">{index + 1}</div>
      <div className="suggestion-main">
        <h2>{suggestion.text}</h2>
        <p>{suggestion.metadata.reason}</p>
        {suggestion.metadata.personalizationReason ? (
          <span className="personalization-note">{suggestion.metadata.personalizationReason}</span>
        ) : null}
        {suggestion.metadata.address ? <span className="address">{suggestion.metadata.address}</span> : null}
      </div>
      <div className="suggestion-meta">
        <span className="type-badge">{suggestion.type}</span>
        <strong>{suggestion.score.toFixed(2)}</strong>
        {debug ? <small>{suggestion.source}</small> : null}
      </div>
    </article>
  );
}

function Metric({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="metric">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

export default App;
