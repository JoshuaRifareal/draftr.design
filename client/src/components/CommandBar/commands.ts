// components/CommandBar/commands.ts - CORRECTED VERSION
import type { CommandContext } from '../../services/CommandService';
import type { DrawingPrimitive } from '../../types/draftrTypes';

export interface Command {
  id: string;
  name: string;
  description: string;
  category: 'tools' | 'view' | 'edit' | 'file' | 'debug';
  aliases: string[];
  icon?: string;
  execute: (context: CommandContext, params?: any) => Promise<any>; // ✅ Changed to async
  undo?: (context: CommandContext, data: any) => void;
}

// Levenshtein distance for fuzzy matching
const levenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
};

const similarityScore = (a: string, b: string): number => {
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLength = Math.max(a.length, b.length);
  return maxLength === 0 ? 1 : 1 - distance / maxLength;
};

interface SearchResult {
  command: Command;
  score: number;
  matchType: 'exact' | 'prefix' | 'fuzzy' | 'contains';
  matchedField: 'name' | 'alias' | 'description';
}

export const searchCommands = (query: string, commands: Command[]): Command[] => {
  if (!query.trim()) return [];
  
  const lowerQuery = query.toLowerCase().trim();
  const results: SearchResult[] = [];

  commands.forEach(command => {
    let bestScore = 0;
    let bestMatchType: SearchResult['matchType'] = 'contains';
    let bestMatchedField: SearchResult['matchedField'] = 'name';

    const nameScore = calculateMatchScore(command.name, lowerQuery);
    if (nameScore.score > bestScore) {
      bestScore = nameScore.score;
      bestMatchType = nameScore.matchType;
      bestMatchedField = 'name';
    }

    command.aliases.forEach(alias => {
      const aliasScore = calculateMatchScore(alias, lowerQuery);
      if (aliasScore.score > bestScore) {
        bestScore = aliasScore.score;
        bestMatchType = aliasScore.matchType;
        bestMatchedField = 'alias';
      }
    });

    const descScore = calculateMatchScore(command.description, lowerQuery);
    const weightedDescScore = descScore.score * 0.3;
    if (weightedDescScore > bestScore) {
      bestScore = weightedDescScore;
      bestMatchType = descScore.matchType;
      bestMatchedField = 'description';
    }

    if (command.category === 'tools') {
      bestScore *= 1.2;
    }

    if (bestScore >= 0.3) {
      results.push({
        command,
        score: bestScore,
        matchType: bestMatchType,
        matchedField: bestMatchedField,
      });
    }
  });

  return results
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const matchTypePriority = { exact: 4, prefix: 3, fuzzy: 2, contains: 1 };
      if (matchTypePriority[b.matchType] !== matchTypePriority[a.matchType]) {
        return matchTypePriority[b.matchType] - matchTypePriority[a.matchType];
      }
      const categoryPriority = { tools: 4, view: 3, edit: 2, file: 1 };
      return categoryPriority[b.command.category] - categoryPriority[a.command.category];
    })
    .map(result => result.command);
};

const calculateMatchScore = (text: string, query: string): { score: number; matchType: SearchResult['matchType'] } => {
  const lowerText = text.toLowerCase();
  
  if (lowerText === query) {
    return { score: 1.0, matchType: 'exact' };
  }
  
  if (lowerText.startsWith(query)) {
    const lengthBonus = query.length / lowerText.length;
    return { score: 0.9 + lengthBonus * 0.1, matchType: 'prefix' };
  }
  
  if (lowerText.includes(query)) {
    const positionBonus = 1 - (lowerText.indexOf(query) / lowerText.length);
    return { score: 0.7 + positionBonus * 0.2, matchType: 'contains' };
  }
  
  const similarity = similarityScore(text, query);
  if (similarity > 0.6) {
    return { score: similarity * 0.6, matchType: 'fuzzy' };
  }
  
  return { score: 0, matchType: 'contains' };
};

// ✅ CORRECTED COMMAND REGISTRY - Uses getCurrentState() instead of currentState
export const commandRegistry: Command[] = [
  // Tools
  {
    id: 'selection-tool',
    name: 'Selection Tool',
    description: 'Select and manipulate objects',
    category: 'tools',
    aliases: ['select', 'selection', 'move', 'arrow', 'cursor', 'sel', 'pick', 'marquee'],
    execute: async (context: CommandContext) => {
      context.stateSetters.setActiveTool('SELECTION');
      context.stateSetters.setCurrentStart(null);
      context.stateSetters.setPreviewEnd(null);
      return { previousTool: context.getCurrentState().activeTool };
    },
    undo: (context: CommandContext, data: any) => {
      context.stateSetters.setActiveTool(data.previousTool);
    }
  },
  {
    id: 'line-tool',
    name: 'Line Tool',
    description: 'Draw straight lines',
    category: 'tools',
    aliases: ['line', 'draw', 'pen', 'stroke', 'ln', 'lin', 'segment', 'vector'],
    execute: async (context: CommandContext) => {
      context.stateSetters.setActiveTool('LINE');
      return { previousTool: context.getCurrentState().activeTool };
    },
    undo: (context: CommandContext, data: any) => {
      context.stateSetters.setActiveTool(data.previousTool);
    }
  },
  {
    id: 'rectangle-tool',
    name: 'Rectangle Tool',
    description: 'Draw rectangles and squares',
    category: 'tools',
    aliases: ['rectangle', 'rect', 'square', 'box', 'rec', 'sq', 'quad', 'polygon'],
    execute: async (context: CommandContext) => {
      context.stateSetters.setActiveTool('RECTANGLE');
      return { previousTool: context.getCurrentState().activeTool };
    },
    undo: (context: CommandContext, data: any) => {
      context.stateSetters.setActiveTool(data.previousTool);
    }
  },
  {
    id: 'circle-tool',
    name: 'Circle Tool',
    description: 'Draw circles and ellipses',
    category: 'tools',
    aliases: ['circle', 'ellipse', 'round', 'oval', 'cir', 'circ', 'crcl', 'ellips'],
    execute: async (context: CommandContext) => {
      context.stateSetters.setActiveTool('CIRCLE');
      return { previousTool: context.getCurrentState().activeTool };
    },
    undo: (context: CommandContext, data: any) => {
      context.stateSetters.setActiveTool(data.previousTool);
    }
  },

  // View commands
  {
    id: 'zoom-in',
    name: 'Zoom In',
    description: 'Zoom into the canvas',
    category: 'view',
    aliases: ['zoomin', 'zoom+', 'larger', 'bigger', 'zin', 'closeup', 'magnify'],
    execute: async (context: CommandContext) => {
      const currentState = context.getCurrentState(); // ✅ Fixed
      const newScale = currentState.scale * 1.2;
      context.stateSetters.setScale(newScale);
      return { previousScale: currentState.scale };
    },
    undo: (context: CommandContext, data: any) => {
      context.stateSetters.setScale(data.previousScale);
    }
  },
  {
    id: 'zoom-out',
    name: 'Zoom Out',
    description: 'Zoom out of the canvas',
    category: 'view',
    aliases: ['zoomout', 'zoom-', 'smaller', 'zout', 'overview', 'wide'],
    execute: async (context: CommandContext) => {
      const currentState = context.getCurrentState(); // ✅ Fixed
      const newScale = currentState.scale / 1.2;
      context.stateSetters.setScale(Math.max(0.05, newScale));
      return { previousScale: currentState.scale };
    },
    undo: (context: CommandContext, data: any) => {
      context.stateSetters.setScale(data.previousScale);
    }
  },
  {
    id: 'reset-zoom',
    name: 'Reset Zoom',
    description: 'Reset zoom to 100%',
    category: 'view',
    aliases: ['resetzoom', 'actualsize', '100%', 'normal', 'defaultzoom', 'origin'],
    execute: async (context: CommandContext) => {
      const currentState = context.getCurrentState(); // ✅ Fixed
      context.stateSetters.setScale(1.0);
      return { previousScale: currentState.scale };
    },
    undo: (context: CommandContext, data: any) => {
      context.stateSetters.setScale(data.previousScale);
    }
  },

  // Edit commands
  {
    id: 'toggle-grid',
    name: 'Toggle Grid',
    description: 'Show/hide grid',
    category: 'edit',
    aliases: ['grid', 'showgrid', 'hidegrid', 'ruler', 'snapgrid', 'guides'],
    execute: async (context: CommandContext) => {
      console.log('Toggle grid functionality - to be implemented');
      return {};
    }
  },
  {
    id: 'clear-canvas',
    name: 'Clear Canvas',
    description: 'Clear all drawings',
    category: 'edit',
    aliases: ['clear', 'reset'],
    execute: async (context: CommandContext) => {
      const currentState = context.getCurrentState(); // ✅ Fixed
      const previousPrimitives = currentState.primitives;
      context.stateSetters.setPrimitives([]);
      context.stateSetters.setSelectedPrimitiveIds([]);
      return { previousPrimitives };
    },
    undo: (context: CommandContext, data: any) => {
      context.stateSetters.setPrimitives(data.previousPrimitives);
    }
  },
  {
    id: 'draw-line',
    name: 'Draw Line',
    description: 'Draw a new line',
    category: 'edit',
    aliases: ['line', 'add-line'],
    execute: async (context: CommandContext, params: { primitive: DrawingPrimitive }) => {
      console.log('✏️ Draw-line command executing');
      
      const currentState = context.getCurrentState();
      
      const newPrimitives = [...currentState.primitives, params.primitive];
      
      context.stateSetters.setPrimitives(newPrimitives);
      
      return { 
        primitiveId: params.primitive.id,
        previousPrimitives: currentState.primitives 
      };
    },
    undo: (context: CommandContext, data: any) => {
      console.log('⏪ Draw-line undo executing');
      const currentState = context.getCurrentState(); // ✅ Fixed
      const newPrimitives = currentState.primitives.filter(p => p.id !== data.primitiveId);
      context.stateSetters.setPrimitives(newPrimitives);
    }
  },
  {
    id: 'delete-selected',
    name: 'Delete Selected',
    description: 'Delete selected objects',
    category: 'edit',
    aliases: ['delete', 'del', 'remove'],
    execute: async (context: CommandContext, params?: { selectedIds: string[] }) => {
      const selectedIds = params?.selectedIds || [];
      const currentState = context.getCurrentState(); // ✅ Fixed
      const currentPrimitives = currentState.primitives;
      
      const newPrimitives = currentPrimitives.filter(p => !selectedIds.includes(p.id));
      context.stateSetters.setPrimitives(newPrimitives);
      context.stateSetters.setSelectedPrimitiveIds([]);
      
      return { 
        deletedPrimitives: currentPrimitives.filter(p => selectedIds.includes(p.id))
      };
    },
    undo: (context: CommandContext, data: any) => {
      const currentState = context.getCurrentState(); // ✅ Fixed
      const newPrimitives = [...currentState.primitives, ...data.deletedPrimitives];
      context.stateSetters.setPrimitives(newPrimitives);
    }
  },
];