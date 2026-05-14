import React from 'react';
import { socket } from '../network';
import { RECIPES } from 'common';

interface CookingMenuProps {
  inventory: Record<string, number>;
  onClose: () => void;
}

export const CookingMenu: React.FC<CookingMenuProps> = ({ inventory, onClose }) => {
  const formatName = (id: string) => id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

  const canCook = (recipeId: string) => {
    const ingredients = RECIPES[recipeId];
    return Object.entries(ingredients).every(([ing, count]) => (inventory[ing] || 0) >= count);
  };

  const handleCook = (recipeId: string) => {
    if (canCook(recipeId)) {
        socket.emit('cook', recipeId);
    }
  };

  return (
    <div className="cooking-menu-overlay" style={{
      position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, pointerEvents: 'auto'
    }}>
      <div className="cooking-menu" style={{
        background: '#2c3e50', color: 'white', padding: '20px', borderRadius: '10px',
        width: '500px', maxHeight: '80vh', overflowY: 'auto', border: '2px solid #ecf0f1'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>Cooking Pot</h2>
          <button onClick={onClose} style={{ background: '#e74c3c', color: 'white', border: 'none', padding: '5px 15px', borderRadius: '5px', cursor: 'pointer' }}>Close</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {Object.entries(RECIPES).map(([id, ingredients]) => {
            const possible = canCook(id);
            return (
              <div key={id} style={{
                background: possible ? '#34495e' : '#2c3e50',
                padding: '10px',
                borderRadius: '5px',
                border: possible ? '1px solid #2ecc71' : '1px solid #7f8c8d',
                opacity: possible ? 1 : 0.6,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div>
                  <h4 style={{ margin: '0 0 5px 0' }}>{formatName(id)}</h4>
                  <div style={{ fontSize: '11px', color: '#bdc3c7' }}>
                    {Object.entries(ingredients).map(([ing, count]) => (
                      <div key={ing} style={{ color: (inventory[ing] || 0) >= count ? '#2ecc71' : '#e74c3c' }}>
                        {ing}: {inventory[ing] || 0}/{count}
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  disabled={!possible}
                  onClick={() => handleCook(id)}
                  style={{
                    marginTop: '10px',
                    padding: '5px',
                    background: possible ? '#2ecc71' : '#95a5a6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: possible ? 'pointer' : 'not-allowed'
                  }}
                >
                  Cook
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
