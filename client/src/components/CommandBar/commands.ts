import { CommandAdapters } from '../../services/CommandAdapters';
import { appStateStore } from '../../services/AppStateStore';
import { getErrorMessage, safeAsync } from '../../utils/errorHandling';

// Command interface
export interface Command {
  id: string;
  name: string;
  description: string;
  category: 'tools' | 'view' | 'edit' | 'file';
  aliases: string[];
  icon?: string;
  execute: (params?: any) => Promise<any>;
  undo?: (data: any) => void;
}

// Levenshtein distance for fuzzy matching (keep this as is)
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

// COMMAND REGISTRY - Using CommandAdapters directly
export const commandRegistry: Command[] = [

  // Tools
  {
    id: 'selection-tool',
    name: 'Selection Tool',
    description: 'Select and manipulate objects',
    category: 'tools',
    aliases: ['select', 'selection', 'arrow', 'cursor', 'sel', 'pick', 'marquee'],
    execute: async () => {
      const { error } = await safeAsync(async () => {
        CommandAdapters.setActiveTool('SELECTION');
        return { success: true };
      }, { success: false });

      if (error) {
        console.error('🚨 selection-tool command failed:', error);
        return { success: false, error };
      }
      
      return { success: true };
    }
  },
  {
    id: 'line-tool',
    name: 'Line Tool',
    description: 'Draw straight lines',
    category: 'tools',
    aliases: ['line', 'add', 'draw', 'pen', 'stroke', 'ln', 'lin', 'segment', 'vector'],
    execute: async () => {
      const { error } = await safeAsync(async () => {
        CommandAdapters.setActiveTool('LINE');
        return { success: true };
      }, { success: false });

      if (error) {
        console.error('🚨 line-tool command failed:', error);
        return { success: false, error };
      }
      
      return { success: true };
    }
  },
  {
    id: 'rectangle-tool',
    name: 'Rectangle Tool',
    description: 'Draw rectangles and squares',
    category: 'tools',
    aliases: ['rectangle', 'rect', 'box', 'rec', 'quad', 'polygon'],
    execute: async () => {
      const { error } = await safeAsync(async () => {
        CommandAdapters.setActiveTool('RECTANGLE');
        return { success: true };
      }, { success: false });

      if (error) {
        console.error('🚨 rectangle-tool command failed:', error);
        return { success: false, error };
      }
      
      return { success: true };
    }
  },
  {
    id: 'circle-tool',
    name: 'Circle Tool',
    description: 'Draw circles and ellipses',
    category: 'tools',
    aliases: ['circle', 'ellipse', 'round', 'oval', 'cir', 'circ', 'crcl', 'ellips'],
    execute: async () => {
      const { error } = await safeAsync(async () => {
        CommandAdapters.setActiveTool('CIRCLE');
        return { success: true };
      }, { success: false });

      if (error) {
        console.error('🚨 circle-tool command failed:', error);
        return { success: false, error };
      }
      
      return { success: true };
    }
  },

  // View commands
  {
    id: 'zoom-in',
    name: 'Zoom In',
    description: 'Zoom into the canvas',
    category: 'view',
    aliases: ['zoomin', 'zoom+', 'larger', 'bigger', 'zin', 'closeup', 'magnify'],
    execute: async () => {
      const { error } = await safeAsync(async () => {
        const currentState = appStateStore.getState();
        const newScale = currentState.scale * 1.2;
        CommandAdapters.zoom(newScale, currentState.offsetX, currentState.offsetY);
        return { success: true };
      }, { success: false });

      if (error) {
        console.error('🚨 zoom-in command failed:', error);
        return { success: false, error };
      }
      
      return { success: true };
    }
  },
  {
    id: 'zoom-out', 
    name: 'Zoom Out',
    description: 'Zoom out of the canvas',
    category: 'view',
    aliases: ['zoomout', 'zoom-', 'smaller', 'zout', 'overview', 'wide'],
    execute: async () => {
      const { error } = await safeAsync(async () => {
        const currentState = appStateStore.getState();
        const newScale = currentState.scale / 1.2;
        CommandAdapters.zoom(Math.max(0.05, newScale), currentState.offsetX, currentState.offsetY);
        return { success: true };
      }, { success: false });

      if (error) {
        console.error('🚨 zoom-out command failed:', error);
        return { success: false, error };
      }
      
      return { success: true };
    }
  },
  {
    id: 'reset-zoom',
    name: 'Reset Zoom',
    description: 'Reset zoom to 100%',
    category: 'view',
    aliases: ['resetzoom', 'actualsize', '100%', 'normal', 'defaultzoom', 'origin'],
    execute: async () => {
      const { error } = await safeAsync(async () => {
        const currentState = appStateStore.getState();
        CommandAdapters.zoom(1.0, currentState.offsetX, currentState.offsetY);
        return { success: true };
      }, { success: false });

      if (error) {
        console.error('🚨 reset-zoom command failed:', error);
        return { success: false, error };
      }
      
      return { success: true };
    }
  },

  // Edit commands
  {
    id: 'clear-canvas',
    name: 'Clear Canvas',
    description: 'Clear all drawings',
    category: 'edit',
    aliases: ['clear', 'reset'],
    execute: async () => {
      const { error } = await safeAsync(async () => {
        CommandAdapters.clearCanvas();
        return { success: true };
      }, { success: false });

      if (error) {
        console.error('🚨 clear-canvas command failed:', error);
        return { success: false, error };
      }
      
      return { success: true };
    }
  },
  {
    id: 'delete-selected',
    name: 'Delete Selected',
    description: 'Delete selected objects',
    category: 'edit',
    aliases: ['delete', 'x', 'del', 'remove'],
    execute: async (params?: { selectedIds: string[] }) => {
      const { error } = await safeAsync(async () => {
        const selectedIds = params?.selectedIds || [];
        CommandAdapters.deleteSelected(selectedIds);
        return { success: true };
      }, { success: false });

      if (error) {
        console.error('🚨 delete-selected command failed:', error);
        return { success: false, error };
      }
      
      return { success: true };
    }
  },

  // Transform commands
  {
    id: 'move-selection',
    name: 'Move Selection',
    description: 'Move selected objects to new position',
    category: 'edit',
    aliases: ['move', 'mv', 'translate', 'drag', 'shift', 'relocate', 'position'],
    execute: async () => {
      const { error } = await safeAsync(async () => {
        const currentState = appStateStore.getState();
        
        if (currentState.selectedPrimitiveIds.length === 0) {
          throw new Error('No objects selected to move');
        }
        
        CommandAdapters.startTransform('move');
        return { success: true, message: 'Move transform started - click base point' };
      }, { success: false, message: 'Move command failed' }); // 🎯 FIX: Add message property

      if (error) {
        console.error('🚨 move-selection command failed:', error);
        return { success: false, error };
      }
      
      return { success: true, message: 'Move transform started' };
    }
  },

  {
    id: 'scale-selection',
    name: 'Scale Selection', 
    description: 'Resize selected objects',
    category: 'edit',
    aliases: ['scale', 'resize', 'size', 'zoom', 'enlarge', 'shrink', 'stretch'],
    execute: async () => {
      const { error } = await safeAsync(async () => {
        const currentState = appStateStore.getState();
        
        if (currentState.selectedPrimitiveIds.length === 0) {
          throw new Error('No objects selected to scale');
        }
        
        CommandAdapters.startTransform('scale');
        return { success: true, message: 'Scale transform started - click base point' };
      }, { success: false, message: 'Scale command failed' }); // 🎯 FIX: Add message property

      if (error) {
        console.error('🚨 scale-selection command failed:', error);
        return { success: false, error };
      }
      
      return { success: true, message: 'Scale transform started' };
    }
  },

  {
    id: 'rotate-selection',
    name: 'Rotate Selection',
    description: 'Rotate selected objects',
    category: 'edit',
    aliases: ['rotate', 'turn', 'spin', 'pivot', 'revolve', 'angle'],
    execute: async () => {
      const { error } = await safeAsync(async () => {
        const currentState = appStateStore.getState();
        
        if (currentState.selectedPrimitiveIds.length === 0) {
          throw new Error('No objects selected to rotate');
        }
        
        CommandAdapters.startTransform('rotate');
        return { success: true, message: 'Rotate transform started - click base point' };
      }, { success: false, message: 'Rotate command failed' }); // 🎯 FIX: Add message property

      if (error) {
        console.error('🚨 rotate-selection command failed:', error);
        return { success: false, error };
      }
      
      return { success: true, message: 'Rotate transform started' };
    }
  },

  {
    id: 'move-tool',
    name: 'Move Tool',
    description: 'Activate move transformation tool',
    category: 'tools',
    aliases: ['movetool', 'movet', 'mtool'],
    execute: async () => {
      const { error } = await safeAsync(async () => {
        const currentState = appStateStore.getState();
        if (currentState.selectedPrimitiveIds.length === 0) {
          CommandAdapters.setActiveTool('SELECTION');
          return { success: true, message: 'Switch to selection tool to select objects first' };
        } else {
          CommandAdapters.startTransform('move');
          return { success: true, message: 'Move transform started - click base point' };
        }
      }, { success: false, message: 'Move tool command failed' }); // 🎯 FIX: Add message property

      if (error) {
        console.error('🚨 move-tool command failed:', error);
        return { success: false, error };
      }
      
      return { success: true, message: 'Move tool activated' };
    }
  },
  
];