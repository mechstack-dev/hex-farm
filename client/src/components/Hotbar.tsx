import React from 'react';

interface HotbarProps {
  inventory: Record<string, number>;
}

export const Hotbar: React.FC<HotbarProps> = ({ inventory }) => {
  const slots = [
    { key: '1', species: 'turnip', color: '#FFFFFF' },
    { key: '2', species: 'carrot', color: '#FFA500' },
    { key: '3', species: 'pumpkin', color: '#FF8C00' },
    { key: '4', species: 'corn', color: '#FFFF00' },
    { key: '5', species: 'wheat', color: '#DAA520' },
    { key: '6', species: 'winter-radish', color: '#E6E6FA' },
    { key: '7', species: 'kale', color: '#006400' },
    { key: '8', species: 'sunflower', color: '#FFD700' },
    { key: '9', species: 'apple-tree', color: '#FF0000' },
    { key: '0', species: 'orange-tree', color: '#FF4500' },
    { key: '-', species: 'peach-tree', color: '#FFDAB9' },
    { key: '=', species: 'cherry-tree', color: '#B22222' },
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
              width: '24px',
              height: '24px',
              background: slot.color,
              borderRadius: slot.species.endsWith('-tree') ? '50%' : '2px',
              border: seedCount > 0 ? '2px solid white' : '2px solid #333',
              opacity: seedCount > 0 ? 1 : 0.3,
              boxShadow: seedCount > 0 ? `0 0 10px ${slot.color}` : 'none'
            }} />
            <div style={{
              fontSize: '10px',
              textTransform: 'capitalize',
              textAlign: 'center',
              lineHeight: '1.2',
              marginTop: '2px',
              color: seedCount > 0 ? 'white' : '#666'
            }}>
              {slot.species.replace('-tree', '').charAt(0).toUpperCase() + slot.species.replace('-tree', '').slice(1, 3)}
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
