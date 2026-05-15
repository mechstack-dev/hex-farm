import React from 'react';

interface HotbarProps {
  inventory: Record<string, number>;
}

export const Hotbar: React.FC<HotbarProps> = ({ inventory }) => {
  const slots = [
    { key: '1', species: 'turnip' },
    { key: '2', species: 'carrot' },
    { key: '3', species: 'pumpkin' },
    { key: '4', species: 'corn' },
    { key: '5', species: 'wheat' },
    { key: '6', species: 'winter-radish' },
    { key: '7', species: 'kale' },
    { key: '8', species: 'sunflower' },
    { key: '9', species: 'apple-tree' },
    { key: '0', species: 'orange-tree' },
    { key: '-', species: 'peach-tree' },
    { key: '=', species: 'cherry-tree' },
  ];

  return (
    <div className="hotbar" style={{
      position: 'absolute',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: '10px',
      background: 'rgba(0, 0, 0, 0.6)',
      padding: '10px',
      borderRadius: '10px',
      border: '2px solid rgba(255, 255, 255, 0.2)',
      pointerEvents: 'auto'
    }}>
      {slots.map((slot) => {
        const seedCount = inventory[`${slot.species}-seed`] || 0;
        return (
          <div key={slot.key} style={{
            width: '50px',
            height: '50px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '5px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            border: '1px solid rgba(255, 255, 255, 0.3)'
          }}>
            <span style={{
              position: 'absolute',
              top: '2px',
              left: '2px',
              fontSize: '10px',
              color: '#aaa'
            }}>{slot.key}</span>
            <div style={{
              fontSize: '18px',
              textTransform: 'capitalize',
              textAlign: 'center',
              lineHeight: '1',
              color: seedCount > 0 ? 'white' : '#666'
            }}>
              {slot.species.charAt(0).toUpperCase()}
            </div>
            <span style={{
              position: 'absolute',
              bottom: '2px',
              right: '2px',
              fontSize: '12px',
              fontWeight: 'bold',
              color: seedCount > 0 ? '#44ff44' : '#ff4444'
            }}>{seedCount}</span>
          </div>
        );
      })}
    </div>
  );
};
