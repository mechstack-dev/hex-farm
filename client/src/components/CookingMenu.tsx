import React from 'react';
import { socket } from '../network';

interface CookingMenuProps {
  inventory: Record<string, number>;
  onClose: () => void;
}

const RECIPES: Record<string, { ingredients: Record<string, number>, name: string }> = {
    'salad': { name: 'Salad', ingredients: { 'turnip': 1, 'carrot': 1 } },
    'apple-pie': { name: 'Apple Pie', ingredients: { 'apple': 3, 'wheat': 1 } },
    'pumpkin-soup': { name: 'Pumpkin Soup', ingredients: { 'pumpkin': 1, 'milk': 1 } },
    'corn-chowder': { name: 'Corn Chowder', ingredients: { 'corn': 2, 'milk': 1 } },
    'grilled-fish': { name: 'Grilled Fish', ingredients: { 'fish': 1, 'wood': 1 } },
    'mushroom-soup': { name: 'Mushroom Soup', ingredients: { 'mushroom': 2, 'milk': 1 } },
    'berry-tart': { name: 'Berry Tart', ingredients: { 'berry': 3, 'wheat': 1 } },
    'miners-stew': { name: "Miner's Stew", ingredients: { 'carrot': 2, 'fish': 1, 'iron-ore': 1 } },
    'veggie-platter': { name: 'Veggie Platter', ingredients: { 'turnip': 2, 'pumpkin': 1, 'corn': 1 } },
    'coal-grilled-fish': { name: 'Coal-Grilled Fish', ingredients: { 'fish': 1, 'coal': 1 } },
    'fruit-salad': { name: 'Fruit Salad', ingredients: { 'apple': 1, 'berry': 1 } },
    'mushroom-risotto': { name: 'Mushroom Risotto', ingredients: { 'mushroom': 2, 'wheat': 1 } },
    'corn-bread': { name: 'Corn Bread', ingredients: { 'corn': 2, 'wheat': 1 } },
    'fish-stew': { name: 'Fish Stew', ingredients: { 'fish': 1, 'carrot': 1, 'corn': 1 } },
    'fruity-sorbet': { name: 'Fruity Sorbet', ingredients: { 'berry': 2, 'apple': 1, 'sunflower': 1 } },
    'hearty-stew': { name: 'Hearty Stew', ingredients: { 'winter-radish': 1, 'carrot': 1, 'mushroom': 1, 'wood': 1 } },
    'seafood-platter': { name: 'Seafood Platter', ingredients: { 'fish': 2, 'corn': 1, 'junk': 1 } },
    'honey-glazed-carrots': { name: 'Honey-Glazed Carrots', ingredients: { 'carrot': 2, 'honey': 1 } },
    'goat-cheese-salad': { name: 'Goat Cheese Salad', ingredients: { 'turnip': 1, 'goat-milk': 1 } },
    'duck-egg-mayo': { name: 'Duck-Egg Mayo', ingredients: { 'duck-egg': 1, 'sunflower': 1 } },
    'berry-smoothie': { name: 'Berry Smoothie', ingredients: { 'berry': 2, 'milk': 1 } },
    'pumpkin-pie': { name: 'Pumpkin Pie', ingredients: { 'pumpkin': 1, 'wheat': 1, 'egg': 1 } },
    'apple-cider': { name: 'Apple Cider', ingredients: { 'apple': 3, 'honey': 1 } },
    'orange-juice': { name: 'Orange Juice', ingredients: { 'orange': 3 } }
};

export const CookingMenu: React.FC<CookingMenuProps> = ({ inventory, onClose }) => {
  const canCook = (recipeId: string) => {
    const recipe = RECIPES[recipeId];
    return Object.entries(recipe.ingredients).every(([ing, count]) => (inventory[ing] || 0) >= count);
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
          {Object.entries(RECIPES).map(([id, recipe]) => {
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
                  <h4 style={{ margin: '0 0 5px 0' }}>{recipe.name}</h4>
                  <div style={{ fontSize: '11px', color: '#bdc3c7' }}>
                    {Object.entries(recipe.ingredients).map(([ing, count]) => (
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
