import React, { useState, useEffect } from 'react';
import { simulator } from './ethersSimulator';
import './index.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('hub');
  const [markets, setMarkets] = useState([]);
  const [users, setUsers] = useState({});
  const [currentUserKey, setCurrentUserKey] = useState('alice');
  const [logs, setLogs] = useState([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [stakeAmount, setStakeAmount] = useState('100');
  const [proposalOutcome, setProposalOutcome] = useState('YES');
  const [activeExploit, setActiveExploit] = useState('oracle_manipulation');
  const [exploitMode, setExploitMode] = useState('vulnerable');
  const [exploitResult, setExploitResult] = useState(null);

  useEffect(() => { refreshData(); }, []);

  const refreshData = () => {
    setMarkets([...simulator.markets]);
    setUsers({ ...simulator.users });
    setLogs([...simulator.logs]);
  };

  const handleCreateMarket = (e) => {
    e.preventDefault();
    if (!newQuestion.trim()) return;
    simulator.createMarket(newQuestion);
    setNewQuestion('');
    refreshData();
  };

  const handleStake = (marketId, outcomeIdx) => {
    const user = users[currentUserKey];
    try {
      simulator.stake(marketId, user.address, outcomeIdx, parseFloat(stakeAmount));
      refreshData();
    } catch (err) { alert(err.message); }
  };

  const handleLock = (marketId) => {
    try { simulator.lockMarket(marketId); refreshData(); } catch (err) { alert(err.message); }
  };

  const handlePropose = (marketId) => {
    const user = users[currentUserKey];
    try { simulator.proposeOracleOutcome(marketId, user.address, proposalOutcome); refreshData(); } catch (err) { alert(err.message); }
  };

  const handleDispute = (marketId) => {
    const user = users[currentUserKey];
    try { simulator.disputeOracleOutcome(marketId, user.address); refreshData(); } catch (err) { alert(err.message); }
  };

  const handleResolveDispute = (marketId, outcome) => {
    try { simulator.resolveDispute(marketId, outcome); refreshData(); } catch (err) { alert(err.message); }
  };

  const handleFinalizeUncontested = (marketId) => {
    try { simulator.finalizeUncontested(marketId); refreshData(); } catch (err) { alert(err.message); }
  };

  const handleClaim = (marketId) => {
    const user = users[currentUserKey];
    try {
      const payout = simulator.claimPayout(marketId, user.address, exploitMode === 'vulnerable');
      alert(`Claimed $${payout.toFixed(2)} USDC!`);
      refreshData();
    } catch (err) { alert(err.message); }
  };

  const handleRunExploit = () => {
    const res = simulator.executeExploit(activeExploit, exploitMode);
    setExploitResult(res);
    refreshData();
  };

  const exploitConfigs = {
    oracle_manipulation: { title: '1. Oracle Dispute & Bond Manipulation', severity: 'CRITICAL', vulnDesc: 'Single unbonded reporter alters market outcome without financial stake.', securedDesc: 'Multi-reporter oracle with $100 bond + 24h dispute window + 2x counter-bond slashing.', vulnCode: `// Vulnerable: Unbonded single reporter\nwinningOutcome = oracleOutcome;\nstate = MarketState.RESOLVED;`, securedCode: `// Secured: 2x Counter-bond slashing\nrequire(bond >= MIN_REPORTER_BOND);\nusdc.transferFrom(msg.sender, address(this), bond);` },
    front_running: { title: '2. Mempool Front-Running & MEV Arbitrage', severity: 'HIGH', vulnDesc: 'MEV bot sees pending resolution in mempool and stakes before block lands.', securedDesc: 'Pre-resolution LOCKED state disables staking prior to oracle resolution execution.', vulnCode: `// Vulnerable: Staking open until tx executes\nrequire(state == MarketState.OPEN);\nrequire(block.timestamp < resolutionDeadline);`, securedCode: `// Secured: Pre-resolution State Lock\nfunction lockMarket() external {\n    require(block.timestamp >= resolutionDeadline);\n    state = MarketState.LOCKED;\n}` },
    precision_loss: { title: '3. Integer Division Truncation (Wei Loss)', severity: 'HIGH', vulnDesc: 'Unscaled integer division truncates micro-payouts to 0 USDC.', securedDesc: '1e18 High-precision math scaling preserves exact wei values.', vulnCode: `// Vulnerable: Unscaled integer division\npayout = (userStake * totalPool) / winningPool;`, securedCode: `// Secured: 1e18 Scaled Math\nuint256 shareRatio = (userStake * 1e18) / winningPool;\npayout = (shareRatio * totalPool) / 1e18;` },
    reentrancy: { title: '4. External Call Reentrancy Exploit', severity: 'CRITICAL', vulnDesc: 'USDC token transfer executed BEFORE setting hasClaimed = true.', securedDesc: 'Checks-Effects-Interactions (CEI) + ReentrancyGuard modifier lock.', vulnCode: `// Vulnerable: Call before state update\nusdc.transfer(msg.sender, payout);\nhasClaimed[msg.sender] = true;`, securedCode: `// Secured: CEI + ReentrancyGuard\nhasClaimed[msg.sender] = true;\nusdc.transfer(msg.sender, payout);` },
    timestamp_manipulation: { title: '5. Validator Timestamp Drift Manipulation', severity: 'MEDIUM', vulnDesc: 'Validator shifts block.timestamp by 15s to accept late post-event bets.', securedDesc: 'Explicit state lock phase + 7-day timeout cancellation grace window.', vulnCode: `// Vulnerable: Naive timestamp check\nrequire(block.timestamp < deadline);`, securedCode: `// Secured: Timeout Refund Path\nrequire(block.timestamp > deadline + 7 days);\nstate = MarketState.CANCELLED;` },
    collusion: { title: '6. Whale-Reporter Collusion & Bribery', severity: 'HIGH', vulnDesc: 'Whale holding 80% losing stake bribes unbonded reporter to report false win.', securedDesc: '2x Dispute counter-bond awards corrupt reporter bond to honest challenger.', vulnCode: `// Vulnerable: Unbonded reporter accepts bribe\noracle.resolveMarketDirectly();`, securedCode: `// Secured: Economic Slashing\nuint256 totalReward = prop.reporterBond + prop.disputeBond;\nusdc.transfer(prop.challenger, totalReward);` }
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <header className="glass-panel" style={{ padding: '24px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, background: 'linear-gradient(135deg, #00f2fe, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            DECENTRALIZED PREDICTION MARKET SECURITY LAB
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
            Smart Contract Security Researcher Portfolio • Real EVM Execution Engine & Exploit Lab
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>Active Wallet</span>
          <select value={currentUserKey} onChange={(e) => setCurrentUserKey(e.target.value)} style={{ background: '#000', color: '#fff', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            {Object.entries(users).map(([k, u]) => (<option key={k} value={k}>{u.name} (${u.balance.toLocaleString()} USDC)</option>))}
          </select>
        </div>
      </header>

      <nav style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <button className={`btn ${activeTab === 'hub' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('hub')}>📊 Markets Hub</button>
        <button className={`btn ${activeTab === 'lab' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setActiveTab('lab')}>⚡ Security Exploit Lab</button>
        <button className={`btn ${activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('audit')}>📜 Audit Report (AUDIT.md)</button>
      </nav>

      {activeTab === 'hub' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Active & Resolved Prediction Markets</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {markets.map((m) => {
                const total = m.totalStakes[0] + m.totalStakes[1];
                const yesPct = total > 0 ? ((m.totalStakes[0] / total) * 100).toFixed(1) : 50;
                const prop = simulator.oracleProposals[m.id];
                return (
                  <div key={m.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div><span className="badge badge-medium">Market #{m.id}</span><h3 style={{ fontSize: '1.1rem', marginTop: '4px' }}>{m.question}</h3></div>
                      <span className={`badge ${m.state === 'OPEN' ? 'badge-low' : m.state === 'LOCKED' ? 'badge-high' : 'badge-medium'}`}>{m.state}</span>
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--accent-green)' }}>YES: ${m.totalStakes[0]} USDC ({yesPct}%)</span>
                        <span style={{ color: 'var(--accent-red)' }}>NO: ${m.totalStakes[1]} USDC ({(100 - yesPct).toFixed(1)}%)</span>
                      </div>
                      <div style={{ height: '8px', background: 'rgba(239,68,68,0.4)', borderRadius: '4px', display: 'flex' }}>
                        <div style={{ width: `${yesPct}%`, background: 'var(--accent-green)', height: '100%' }}></div>
                      </div>
                    </div>
                    {m.state === 'OPEN' && (
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <input type="number" value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} style={{ width: '100px', background: '#000', color: '#fff', padding: '6px', borderRadius: '6px' }} />
                        <button className="btn btn-success" onClick={() => handleStake(m.id, 0)}>Stake YES</button>
                        <button className="btn btn-danger" onClick={() => handleStake(m.id, 1)}>Stake NO</button>
                        <button className="btn btn-secondary" onClick={() => handleLock(m.id)}>Lock Market</button>
                      </div>
                    )}
                    {m.state === 'LOCKED' && !prop && (
                      <div style={{ background: 'rgba(59,130,246,0.1)', padding: '12px', borderRadius: '8px' }}>
                        <h4 style={{ fontSize: '0.9rem', marginBottom: '6px' }}>Propose Outcome ($100 USDC Bond)</h4>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <select value={proposalOutcome} onChange={(e) => setProposalOutcome(e.target.value)} style={{ background: '#000', color: '#fff', padding: '6px', borderRadius: '6px' }}>
                            <option value="YES">YES</option><option value="NO">NO</option><option value="AMBIGUOUS">AMBIGUOUS</option>
                          </select>
                          <button className="btn btn-primary" onClick={() => handlePropose(m.id)}>Propose Outcome</button>
                        </div>
                      </div>
                    )}
                    {prop && !prop.finalized && (
                      <div style={{ background: 'rgba(245,158,11,0.1)', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ fontSize: '0.85rem', marginBottom: '8px' }}>Proposed: <strong>{prop.proposedOutcome}</strong> | State: {prop.disputed ? 'DISPUTED (2x Bonded)' : 'PROPOSED (24h Window)'}</div>
                        {!prop.disputed ? (
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <button className="btn btn-danger" onClick={() => handleDispute(m.id)}>Dispute Outcome ($200 Bond)</button>
                            <button className="btn btn-success" onClick={() => handleFinalizeUncontested(m.id)}>Finalize Uncontested</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <button className="btn btn-success" onClick={() => handleResolveDispute(m.id, 'YES')}>Confirm YES</button>
                            <button className="btn btn-danger" onClick={() => handleResolveDispute(m.id, 'NO')}>Confirm NO</button>
                          </div>
                        )}
                      </div>
                    )}
                    {m.state === 'RESOLVED' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Winner: <strong style={{ color: 'var(--accent-green)' }}>{m.winningOutcome}</strong></span>
                        <button className="btn btn-success" onClick={() => handleClaim(m.id)}>Claim Payout</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>Deploy New Market</h3>
              <form onSubmit={handleCreateMarket} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input type="text" placeholder="Question..." value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} style={{ background: '#000', color: '#fff', padding: '8px', borderRadius: '6px' }} />
                <button type="submit" className="btn btn-primary">Deploy</button>
              </form>
            </div>
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '1rem', color: 'var(--accent-cyan)', marginBottom: '12px' }}>🖥 Real-Time EVM Execution Terminal</h3>
              <div style={{ background: '#0a0d14', borderRadius: '8px', padding: '12px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', maxHeight: '300px', overflowY: 'auto' }}>
                {logs.map((l, i) => (<div key={i} style={{ color: l.includes('EXPLOIT') || l.includes('SLASHING') ? '#ef4444' : l.includes('SECURED') ? '#10b981' : '#9ca3af' }}>{l}</div>))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'lab' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>Vulnerability Vectors</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Object.entries(exploitConfigs).map(([k, cfg]) => (
                <button key={k} onClick={() => { setActiveExploit(k); setExploitResult(null); }} style={{ padding: '12px', borderRadius: '8px', background: activeExploit === k ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${activeExploit === k ? 'var(--accent-blue)' : 'rgba(255,255,255,0.06)'}`, color: '#fff', textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{cfg.title}</div>
                  <span className={`badge badge-${cfg.severity.toLowerCase()}`} style={{ marginTop: '4px' }}>{cfg.severity}</span>
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h2>{exploitConfigs[activeExploit].title}</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className={`btn ${exploitMode === 'vulnerable' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setExploitMode('vulnerable')}>Vulnerable Mode</button>
                  <button className={`btn ${exploitMode === 'secured' ? 'btn-success' : 'btn-secondary'}`} onClick={() => setExploitMode('secured')}>Secured Mode</button>
                </div>
              </div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>{exploitMode === 'vulnerable' ? exploitConfigs[activeExploit].vulnDesc : exploitConfigs[activeExploit].securedDesc}</p>
              <button className={`btn ${exploitMode === 'vulnerable' ? 'btn-danger' : 'btn-success'}`} onClick={handleRunExploit}>▶ Execute Real Contract Simulation ({exploitMode.toUpperCase()})</button>

              {exploitResult && (
                <div style={{ marginTop: '20px', padding: '16px', borderRadius: '10px', background: exploitResult.success ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)', border: `1px solid ${exploitResult.success ? '#ef4444' : '#10b981'}` }}>
                  <h4 style={{ color: exploitResult.success ? '#f87171' : '#34d399', fontWeight: 700, marginBottom: '8px' }}>
                    {exploitResult.success ? '⚡ EXPLOIT SUCCESSFUL (State Derived On-Chain)' : '🛡 EXPLOIT REVERTED / BLOCKED (Contract Guard Active)'}
                  </h4>
                  
                  {exploitResult.revertReason && (
                    <div style={{ background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#f87171', marginBottom: '12px' }}>
                      On-Chain Error: <strong>{exploitResult.revertReason}</strong>
                    </div>
                  )}

                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    Simulated Tx Hash: <code style={{ color: 'var(--accent-cyan)' }}>{exploitResult.txHash}</code> | Block: <strong style={{ color: '#fff' }}>#{exploitResult.blockNumber}</strong>
                  </div>

                  {/* Real State Diff Table */}
                  <h5 style={{ fontSize: '0.85rem', color: '#fff', marginTop: '12px', marginBottom: '6px' }}>Real State Derived Before vs After Execution:</h5>
                  <table className="state-diff-table">
                    <thead>
                      <tr>
                        <th>State Property</th>
                        <th>State BEFORE Tx</th>
                        <th>State AFTER Tx</th>
                        <th>Net Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Attacker Balance</td>
                        <td>${exploitResult.stateBefore.attackerBalance.toLocaleString()} USDC</td>
                        <td style={{ color: exploitResult.stateAfter.attackerBalance !== exploitResult.stateBefore.attackerBalance ? '#f87171' : 'inherit' }}>
                          ${exploitResult.stateAfter.attackerBalance.toLocaleString()} USDC
                        </td>
                        <td style={{ fontWeight: 700, color: exploitResult.stateAfter.attackerBalance > exploitResult.stateBefore.attackerBalance ? '#f87171' : '#9ca3af' }}>
                          {exploitResult.stateAfter.attackerBalance - exploitResult.stateBefore.attackerBalance > 0 
                            ? `+$${(exploitResult.stateAfter.attackerBalance - exploitResult.stateBefore.attackerBalance).toLocaleString()} USDC`
                            : '$0 USDC'}
                        </td>
                      </tr>
                      <tr>
                        <td>Market Collateral Pool</td>
                        <td>${exploitResult.stateBefore.marketPool.toLocaleString()} USDC</td>
                        <td>${exploitResult.stateAfter.marketPool.toLocaleString()} USDC</td>
                        <td>${exploitResult.stateAfter.marketPool - exploitResult.stateBefore.marketPool} USDC</td>
                      </tr>
                      <tr>
                        <td>Contract USDC Balance</td>
                        <td>${exploitResult.stateBefore.contractUsdcBalance.toLocaleString()} USDC</td>
                        <td style={{ color: exploitResult.stateAfter.contractUsdcBalance < exploitResult.stateBefore.contractUsdcBalance ? '#f87171' : 'inherit' }}>
                          ${exploitResult.stateAfter.contractUsdcBalance.toLocaleString()} USDC
                        </td>
                        <td style={{ color: exploitResult.stateAfter.contractUsdcBalance < exploitResult.stateBefore.contractUsdcBalance ? '#f87171' : 'inherit' }}>
                          {exploitResult.stateAfter.contractUsdcBalance - exploitResult.stateBefore.contractUsdcBalance < 0 
                            ? `-$${Math.abs(exploitResult.stateAfter.contractUsdcBalance - exploitResult.stateBefore.contractUsdcBalance).toLocaleString()} USDC (DRAINED)`
                            : '$0 USDC'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ marginBottom: '12px' }}>Solidity Code Contrast</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div><span style={{ color: '#f87171', fontSize: '0.8rem', fontWeight: 700 }}>Vulnerable Pattern</span><pre className="code-block diff-remove">{exploitConfigs[activeExploit].vulnCode}</pre></div>
                <div><span style={{ color: '#34d399', fontSize: '0.8rem', fontWeight: 700 }}>Secured Pattern</span><pre className="code-block diff-add">{exploitConfigs[activeExploit].securedCode}</pre></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="glass-panel" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '16px' }}>Formal Smart Contract Security Audit Report (AUDIT.md)</h2>
          <div className="glass-card">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '8px' }}>ID</th><th>Vulnerability Title</th><th>Severity</th><th>Remediation Status</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}><td style={{ padding: '10px 8px' }}>VULN-01</td><td>External Call Before State Update (Reentrancy)</td><td><span className="badge badge-critical">CRITICAL</span></td><td style={{ color: '#34d399', fontWeight: 600 }}>✅ RESOLVED (CEI + ReentrancyGuard)</td></tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}><td style={{ padding: '10px 8px' }}>VULN-02</td><td>Unbonded Single-Reporter Oracle Manipulation</td><td><span className="badge badge-critical">CRITICAL</span></td><td style={{ color: '#34d399', fontWeight: 600 }}>✅ RESOLVED ($100 Bond + 24h Dispute Slashing)</td></tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}><td style={{ padding: '10px 8px' }}>VULN-03</td><td>Mempool Front-Running Resolution (MEV)</td><td><span className="badge badge-high">HIGH</span></td><td style={{ color: '#34d399', fontWeight: 600 }}>✅ RESOLVED (Pre-resolution LOCKED State)</td></tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}><td style={{ padding: '10px 8px' }}>VULN-04</td><td>Unscaled Integer Division Precision Loss</td><td><span className="badge badge-high">HIGH</span></td><td style={{ color: '#34d399', fontWeight: 600 }}>✅ RESOLVED (1e18 Scaled Math)</td></tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}><td style={{ padding: '10px 8px' }}>VULN-05</td><td>Validator Block Timestamp Manipulation</td><td><span className="badge badge-medium">MEDIUM</span></td><td style={{ color: '#34d399', fontWeight: 600 }}>✅ RESOLVED (State Lock + Grace Window)</td></tr>
                <tr><td style={{ padding: '10px 8px' }}>VULN-06</td><td>Whale-Reporter Collusion & Minority Drainage</td><td><span className="badge badge-high">HIGH</span></td><td style={{ color: '#34d399', fontWeight: 600 }}>✅ RESOLVED (2x Counter-Bond Slashing)</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
