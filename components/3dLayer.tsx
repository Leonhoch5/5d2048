"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, RoundedBox, Sphere, Environment } from "@react-three/drei";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import * as THREE from "three";

// Game state types
type Direction = 'up' | 'down' | 'left' | 'right' | 'layer-up' | 'layer-down';
type GameGrid = number[][];
type LayeredGrid = GameGrid[];

// Game state store
interface GameState {
  layers: LayeredGrid;
  currentLayer: number;
  totalLayers: number;
  score: number;
  gameWon: boolean;
  gameOver: boolean;
  animatingTiles: Map<string, { from: [number, number, number]; to: [number, number, number]; value: number; id: string }>;
  newTiles: Set<string>;
  reset: () => void;
  move: (direction: Direction) => void;
  addRandomTile: (layer?: number) => void;
  checkGameStatus: () => void;
  addLayer: () => void;
  setCurrentLayer: (layer: number) => void;
}

const useGameStore = create<GameState>()(
  subscribeWithSelector((set, get) => ({
    layers: [Array(4).fill(null).map(() => Array(4).fill(0))],
    currentLayer: 0,
    totalLayers: 1,
    score: 0,
    gameWon: false,
    gameOver: false,
    animatingTiles: new Map(),
    newTiles: new Set(),

    reset: () => {
      const newLayers = [Array(4).fill(null).map(() => Array(4).fill(0))];
      set({ 
        layers: newLayers,
        currentLayer: 0,
        totalLayers: 1,
        score: 0, 
        gameWon: false, 
        gameOver: false,
        animatingTiles: new Map(),
        newTiles: new Set()
      });
      // Add initial tiles
      get().addRandomTile(0);
      get().addRandomTile(0);
    },

    addRandomTile: (layerIndex?: number) => {
      const { layers, currentLayer } = get();
      const targetLayer = layerIndex !== undefined ? layerIndex : currentLayer;
      const grid = layers[targetLayer];
      
      if (!grid) return;
      
      const emptyCells: [number, number][] = [];
      
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          if (grid[i][j] === 0) {
            emptyCells.push([i, j]);
          }
        }
      }

      if (emptyCells.length > 0) {
        const [row, col] = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        const value = Math.random() < 0.9 ? 2 : 4;
        const newLayers = layers.map(layer => layer.map(row => [...row]));
        newLayers[targetLayer][row][col] = value;
        
        const newTiles = new Set(get().newTiles);
        newTiles.add(`${targetLayer}-${row}-${col}`);
        
        set({ layers: newLayers, newTiles });
        
        // Clear new tile marker after animation
        setTimeout(() => {
          const currentNewTiles = new Set(get().newTiles);
          currentNewTiles.delete(`${targetLayer}-${row}-${col}`);
          set({ newTiles: currentNewTiles });
        }, 300);
      }
    },

    addLayer: () => {
      const { layers } = get();
      const newLayer = Array(4).fill(null).map(() => Array(4).fill(0));
      const newLayers = [...layers, newLayer];
      set({ layers: newLayers, totalLayers: newLayers.length });
    },

    setCurrentLayer: (layer: number) => {
      const { totalLayers } = get();
      if (layer >= 0 && layer < totalLayers) {
        set({ currentLayer: layer });
      }
    },

    move: (direction: Direction) => {
      const { layers, currentLayer, score } = get();
      const grid = layers[currentLayer];
      if (!grid) return;
      
      let newLayers = layers.map(layer => layer.map(row => [...row]));
      let newScore = score;
      const animatingTiles = new Map();
      let moved = false;

      const slide = (arr: number[]): [number[], boolean] => {
        const original = [...arr];
        let result = arr.filter(val => val !== 0);
        let localMoved = false;
        
        for (let i = 0; i < 4; i++) {
          if (i < result.length) {
            if (original[i] !== result[i]) {
              localMoved = true;
            }
          } else if (original[i] !== 0) {
            localMoved = true;
          }
        }
        
        for (let i = 0; i < result.length - 1; i++) {
          if (result[i] === result[i + 1] && result[i] !== 0) {
            result[i] *= 2;
            newScore += result[i];
            result[i + 1] = 0;
            localMoved = true;
          }
        }
        
        // Remove zeros again after merging
        result = result.filter(val => val !== 0);
        
        // Pad with zeros to maintain array length
        while (result.length < 4) {
          result.push(0);
        }
        
        return [result, localMoved];
      };

      switch (direction) {
        case 'left':
          for (let i = 0; i < 4; i++) {
            const [newRow, rowMoved] = slide(newLayers[currentLayer][i]);
            newLayers[currentLayer][i] = newRow;
            if (rowMoved) moved = true;
          }
          break;
        case 'right':
          for (let i = 0; i < 4; i++) {
            const [newRow, rowMoved] = slide([...newLayers[currentLayer][i]].reverse());
            newLayers[currentLayer][i] = newRow.reverse();
            if (rowMoved) moved = true;
          }
          break;
        case 'up':
          for (let j = 0; j < 4; j++) {
            const column = [newLayers[currentLayer][0][j], newLayers[currentLayer][1][j], newLayers[currentLayer][2][j], newLayers[currentLayer][3][j]];
            const [newColumn, colMoved] = slide(column);
            for (let i = 0; i < 4; i++) {
              newLayers[currentLayer][i][j] = newColumn[i];
            }
            if (colMoved) moved = true;
          }
          break;
        case 'down':
          for (let j = 0; j < 4; j++) {
            const column = [newLayers[currentLayer][0][j], newLayers[currentLayer][1][j], newLayers[currentLayer][2][j], newLayers[currentLayer][3][j]];
            const [newColumn, colMoved] = slide(column.reverse());
            const finalColumn = newColumn.reverse();
            for (let i = 0; i < 4; i++) {
              newLayers[currentLayer][i][j] = finalColumn[i];
            }
            if (colMoved) moved = true;
          }
          break;
        case 'layer-up':
          if (currentLayer < layers.length - 1) {
            set({ currentLayer: currentLayer + 1 });
          }
          return;
        case 'layer-down':
          if (currentLayer > 0) {
            set({ currentLayer: currentLayer - 1 });
          }
          return;
      }

      if (moved) {
        set({ layers: newLayers, score: newScore, animatingTiles });
        setTimeout(() => {
          get().addRandomTile(currentLayer);
          get().checkGameStatus();
        }, 150);
      }
    },

    checkGameStatus: () => {
      const { layers, currentLayer } = get();
      const grid = layers[currentLayer];
      
      if (!grid) return;
      
      // (win condition)
      let hasWon = false;
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          if (grid[i][j] === 2048) {
            hasWon = true;
          }
        }
      }

      // game over
      let canMove = false;
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          if (grid[i][j] === 0) {
            canMove = true;
            break;
          }
          if (
            (i < 3 && grid[i][j] === grid[i + 1][j]) ||
            (j < 3 && grid[i][j] === grid[i][j + 1])
          ) {
            canMove = true;
            break;
          }
        }
        if (canMove) break;
      }

      set({ gameWon: hasWon, gameOver: !canMove });
    }
  }))
);

// Utility functions
function gridToPosition(x: number, y: number, layer: number = 0, z: number = 0): [number, number, number] {
  const spacing = 1.1;
  const layerSpacing = 1.5;
  const offset = (4 - 1) * spacing / 2;
  return [x * spacing - offset, -(y * spacing - offset), z + layer * layerSpacing];
}

function getTileColor(value: number): string {
  const colors: Record<number, string> = {
    0: "#cdc1b4",
    2: "#eee4da",
    4: "#ede0c8", 
    8: "#f2b179",
    16: "#f59563",
    32: "#f67c5f",
    64: "#f65e3b",
    128: "#edcf72",
    256: "#edcc61",
    512: "#edc850",
    1024: "#edc53f",
    2048: "#edc22e",
    4096: "#3c3a32",
  };
  return colors[value] || "#3c3a32";
}

// Animated Tile Component
function AnimatedTile({ 
  row, 
  col, 
  layer,
  value, 
  isNew 
}: { 
  row: number; 
  col: number; 
  layer: number;
  value: number; 
  isNew: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const textRef = useRef<THREE.Mesh>(null);
  const [scale, setScale] = useState(isNew ? 0 : 1);
  const [position] = useState(() => gridToPosition(col, row, layer, 0.1));
  
  // Animation for new tiles
  useFrame((state, delta) => {
    if (isNew && scale < 1) {
      const newScale = Math.min(1, scale + delta * 8);
      setScale(newScale);
      if (meshRef.current) {
        meshRef.current.scale.setScalar(newScale);
      }
    }
  });

  // Hover effect
  const [hovered, setHovered] = useState(false);
  useFrame(() => {
    if (meshRef.current) {
      const targetScale = hovered ? 1.05 : (isNew ? scale : 1);
      meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
    }
  });

  const color = getTileColor(value);
  const textColor = value <= 4 ? "#776e65" : "#f9f6f2";

  return (
    <group position={position}>
      <RoundedBox
        ref={meshRef}
        args={[0.9, 0.9, 0.2]}
        radius={0.05}
        smoothness={4}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <meshPhysicalMaterial 
          color={color}
          roughness={0.2}
          metalness={0.1}
          clearcoat={0.3}
          clearcoatRoughness={0.1}
        />
      </RoundedBox>
      
      <Text
        ref={textRef}
        position={[0, 0, 0.11]}
        fontSize={value >= 1000 ? 0.25 : value >= 100 ? 0.3 : 0.35}
        color={textColor}
        anchorX="center"
        anchorY="middle"
      >
        {value}
      </Text>
    </group>
  );
}

// Game Board Component  
function GameBoard() {
  const { layers, currentLayer, newTiles } = useGameStore();
  
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {/* Render all layers */}
      {layers.map((grid, layerIndex) => (
        <group key={`layer-${layerIndex}`}>
          {/* Board Base for each layer */}
          <RoundedBox 
            args={[5, 5, 0.3]} 
            radius={0.1} 
            position={[0, 0, layerIndex * 1.5 - 0.2]}
          >
            <meshPhysicalMaterial 
              color={layerIndex === currentLayer ? "#bbada0" : "#d6ccc2"} 
              roughness={0.3}
              metalness={0.1}
              transparent={layerIndex !== currentLayer}
              opacity={layerIndex === currentLayer ? 1 : 0.5}
            />
          </RoundedBox>

          {/* Grid Lines for each layer */}
          {Array.from({ length: 5 }).map((_, i) => (
            <group key={`grid-${layerIndex}-${i}`}>
              <mesh position={[i * 1.1 - 2.2, 0, layerIndex * 1.5 - 0.05]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.005, 0.005, 4.4]} />
                <meshBasicMaterial 
                  color="#a39489" 
                  transparent 
                  opacity={layerIndex === currentLayer ? 0.5 : 0.2} 
                />
              </mesh>
              <mesh position={[0, i * 1.1 - 2.2, layerIndex * 1.5 - 0.05]}>
                <cylinderGeometry args={[0.005, 0.005, 4.4]} />
                <meshBasicMaterial 
                  color="#a39489" 
                  transparent 
                  opacity={layerIndex === currentLayer ? 0.5 : 0.2} 
                />
              </mesh>
            </group>
          ))}

          {/* Empty Cell Indicators for each layer */}
          {grid.map((row: number[], rowIndex: number) =>
            row.map((cell: number, colIndex: number) => {
              if (cell === 0) {
                return (
                  <RoundedBox
                    key={`empty-${layerIndex}-${rowIndex}-${colIndex}`}
                    args={[0.9, 0.9, 0.05]}
                    radius={0.05}
                    position={gridToPosition(colIndex, rowIndex, layerIndex, 0.025)}
                  >
                    <meshPhysicalMaterial 
                      color="#cdc1b4" 
                      transparent 
                      opacity={layerIndex === currentLayer ? 0.3 : 0.15}
                      roughness={0.8}
                    />
                  </RoundedBox>
                );
              }
              return null;
            })
          )}

          {/* Game Tiles for each layer */}
          {grid.map((row: number[], rowIndex: number) =>
            row.map((value: number, colIndex: number) => {
              if (value !== 0) {
                const isNew = newTiles.has(`${layerIndex}-${rowIndex}-${colIndex}`);
                return (
                  <AnimatedTile
                    key={`${layerIndex}-${rowIndex}-${colIndex}-${value}`}
                    row={rowIndex}
                    col={colIndex}
                    layer={layerIndex}
                    value={value}
                    isNew={isNew}
                  />
                );
              }
              return null;
            })
          )}
        </group>
      ))}
    </group>
  );
}

// Game UI Component
function GameUI() {
  const { score, currentLayer, totalLayers, gameWon, gameOver, reset, addLayer, setCurrentLayer } = useGameStore();

  return (
    <group position={[0, 0, 3]}>
      {/* Score Display */}
      <RoundedBox args={[2, 0.6, 0.1]} radius={0.05} position={[0, 0, 0]}>
        <meshPhysicalMaterial color="#8f7a66" />
      </RoundedBox>
      <Text
        position={[0, 0, 0.06]}
        fontSize={0.2}
        color="#f9f6f2"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        Score: {score}
      </Text>

      {/* Game Status */}
      {(gameWon || gameOver) && (
        <group position={[0, -1, 0.1]}>
          <RoundedBox args={[3, 0.8, 0.1]} radius={0.05}>
            <meshPhysicalMaterial color={gameWon ? "#4CAF50" : "#f44336"} />
          </RoundedBox>
          <Text
            position={[0, 0, 0.06]}
            fontSize={0.25}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            fontWeight="bold"
          >
            {gameWon ? "You Win!" : "Game Over"}
          </Text>
        </group>
      )}

      {/* Reset Button */}
      <group position={[3, 0, 0]}>
        <RoundedBox 
          args={[1.5, 0.6, 0.1]} 
          radius={0.05}
          onClick={reset}
          onPointerEnter={(e) => {
            const mesh = e.object as THREE.Mesh;
            if (mesh.material && 'color' in mesh.material) {
              (mesh.material as THREE.MeshPhysicalMaterial).color.setHex(0x9f8a76);
            }
          }}
          onPointerLeave={(e) => {
            const mesh = e.object as THREE.Mesh;
            if (mesh.material && 'color' in mesh.material) {
              (mesh.material as THREE.MeshPhysicalMaterial).color.setHex(0x8f7a66);
            }
          }}
        >
          <meshPhysicalMaterial color="#8f7a66" />
        </RoundedBox>
        <Text
          position={[0, 0, 0.06]}
          fontSize={0.15}
          color="#f9f6f2"
          anchorX="center"
          anchorY="middle"
          onClick={reset}
        >
          New Game
        </Text>
      </group>

      {/* Layer Info */}
      <group position={[-3, 0, 0]}>
        <RoundedBox args={[2, 0.6, 0.1]} radius={0.05}>
          <meshPhysicalMaterial color="#8f7a66" />
        </RoundedBox>
        <Text
          position={[0, 0, 0.06]}
          fontSize={0.15}
          color="#f9f6f2"
          anchorX="center"
          anchorY="middle"
        >
          Layer: {currentLayer + 1}/{totalLayers}
        </Text>
      </group>

      {/* Add Layer Button */}
      <group position={[0, -1.5, 0]}>
        <RoundedBox 
          args={[2, 0.6, 0.1]} 
          radius={0.05}
          onClick={() => {
            addLayer();
            // Add initial tiles to new layer
            setTimeout(() => {
              const { addRandomTile, totalLayers } = useGameStore.getState();
              addRandomTile(totalLayers - 1);
              addRandomTile(totalLayers - 1);
            }, 100);
          }}
          onPointerEnter={(e) => {
            const mesh = e.object as THREE.Mesh;
            if (mesh.material && 'color' in mesh.material) {
              (mesh.material as THREE.MeshPhysicalMaterial).color.setHex(0x9f8a76);
            }
          }}
          onPointerLeave={(e) => {
            const mesh = e.object as THREE.Mesh;
            if (mesh.material && 'color' in mesh.material) {
              (mesh.material as THREE.MeshPhysicalMaterial).color.setHex(0x8f7a66);
            }
          }}
        >
          <meshPhysicalMaterial color="#8f7a66" />
        </RoundedBox>
        <Text
          position={[0, 0, 0.06]}
          fontSize={0.15}
          color="#f9f6f2"
          anchorX="center"
          anchorY="middle"
        >
          Add Layer
        </Text>
      </group>
    </group>
  );
}

// Main Component
export default function Layer3D() {
  const { move, reset } = useGameStore();

  // Initialize game
  useEffect(() => {
    reset();
  }, [reset]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          event.preventDefault();
          move('up');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          event.preventDefault();
          move('down');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          event.preventDefault();
          move('left');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          event.preventDefault();
          move('right');
          break;
        case 'r':
        case 'R':
          reset();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [move, reset]);

  return (
    <div className="w-full h-screen relative">
      <Canvas 
        camera={{ position: [0, 8, 6], fov: 50 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#faf8ef"]} />
        
        {/* Lighting */}
        <ambientLight intensity={0.6} />
        <directionalLight 
          position={[10, 10, 10]} 
          intensity={1}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <pointLight position={[-10, -10, -10]} intensity={0.3} />
        
        {/* Environment */}
        <Environment preset="apartment" />
        
        {/* Controls */}
        <OrbitControls 
          enablePan={false}
          enableZoom={true}
          enableRotate={true}
          minDistance={3}
          maxDistance={12}
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2}
          target={[0, 0, 0]}
        />
        
        {/* Game Components */}
        <GameBoard />
        <GameUI />
      </Canvas>
      
      {/* Control Instructions */}
      <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white p-4 rounded">
        <div className="text-sm">
          <div><strong>Controls:</strong></div>
          <div>Arrow Keys / WASD - Move tiles</div>
          <div>R - Reset game</div>
          <div>Mouse - Rotate view</div>
        </div>
      </div>
    </div>
  );
}
