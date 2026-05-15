import React from 'react';

interface JournalProps {
  skills: Record<string, { level: number, xp: number }>;
  relationships: Record<string, number>;
  achievements: string[];
  onClose: () => void;
}

export const Journal: React.FC<JournalProps> = ({ skills, relationships, achievements, onClose }) => {
  return (
    <div className="journal-overlay" style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1001,
      pointerEvents: 'auto'
    }}>
      <div className="journal-book" style={{
        width: '600px',
        height: '450px',
        background: '#f4e4bc',
        borderRadius: '10px',
        padding: '30px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        color: '#4b2c20',
        border: '10px solid #8b4513'
      }}>
        <button onClick={onClose} style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'none',
          border: 'none',
          fontSize: '24px',
          cursor: 'pointer',
          color: '#8b4513'
        }}>×</button>

        <h2 style={{ textAlign: 'center', margin: '0 0 20px 0', borderBottom: '2px solid #8b4513' }}>Explorer's Journal</h2>

        <div style={{ display: 'flex', flex: 1, gap: '20px' }}>
          {/* Left Page: Skills */}
          <div style={{ flex: 1, borderRight: '1px solid rgba(139, 69, 19, 0.3)', paddingRight: '10px' }}>
            <h3 style={{ margin: '0 0 10px 0' }}>Skills</h3>
            {Object.entries(skills).map(([skill, data]) => (
              <div key={skill} style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ textTransform: 'capitalize' }}>{skill}</span>
                  <span>Lv. {data.level}</span>
                </div>
                <div style={{
                  width: '100%',
                  height: '8px',
                  background: 'rgba(0,0,0,0.1)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  marginTop: '2px'
                }}>
                  <div style={{
                    width: `${Math.min(100, (data.xp / (100 * Math.pow(data.level, 1.2))) * 100)}%`,
                    height: '100%',
                    background: '#8b4513'
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* Right Page: Relationships & Achievements */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h3 style={{ margin: '0 0 10px 0' }}>Relationships</h3>
              {Object.entries(relationships).map(([npc, points]) => {
                const hearts = Math.floor(points / 100);
                return (
                  <div key={npc} style={{ marginBottom: '5px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ textTransform: 'capitalize' }}>{npc}</span>
                      <span>{'❤️'.repeat(hearts)}{'🖤'.repeat(10 - hearts)}</span>
                    </div>
                  </div>
                );
              })}
              {Object.keys(relationships).length === 0 && <p style={{ fontSize: '13px', fontStyle: 'italic' }}>No friends yet...</p>}
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 10px 0' }}>Achievements</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {achievements.map(ach => (
                  <div key={ach} style={{
                    background: '#8b4513',
                    color: '#f4e4bc',
                    padding: '2px 8px',
                    borderRadius: '5px',
                    fontSize: '11px',
                    fontWeight: 'bold'
                  }}>
                    {ach.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                  </div>
                ))}
                {achievements.length === 0 && <p style={{ fontSize: '13px', fontStyle: 'italic' }}>Adventure awaits!</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
