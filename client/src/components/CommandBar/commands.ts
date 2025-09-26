export interface Command {
    id: string;
    name: string;
    description: string;
    category: 'tools' | 'view' | 'edit' | 'file';
    aliases: string[];
    action: () => void;
    icon?: string;
  }
  
  // Levenshtein distance for fuzzy matching
  const levenshteinDistance = (a: string, b: string): number => {
    const matrix: number[][] = [];
  
    // Increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
  
    // Increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
  
    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
  
    return matrix[b.length][a.length];
  };
  
  // Calculate similarity score (0 to 1)
  const similarityScore = (a: string, b: string): number => {
    const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
    const maxLength = Math.max(a.length, b.length);
    return maxLength === 0 ? 1 : 1 - distance / maxLength;
  };
  
  // Advanced scoring system
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
  
      // Check command name
      const nameScore = calculateMatchScore(command.name, lowerQuery);
      if (nameScore.score > bestScore) {
        bestScore = nameScore.score;
        bestMatchType = nameScore.matchType;
        bestMatchedField = 'name';
      }
  
      // Check aliases
      command.aliases.forEach(alias => {
        const aliasScore = calculateMatchScore(alias, lowerQuery);
        if (aliasScore.score > bestScore) {
          bestScore = aliasScore.score;
          bestMatchType = aliasScore.matchType;
          bestMatchedField = 'alias';
        }
      });
  
      // Check description (lower weight)
      const descScore = calculateMatchScore(command.description, lowerQuery);
      const weightedDescScore = descScore.score * 0.3; // Description matches are less important
      if (weightedDescScore > bestScore) {
        bestScore = weightedDescScore;
        bestMatchType = descScore.matchType;
        bestMatchedField = 'description';
      }
  
      // Apply category bonus
      if (command.category === 'tools') {
        bestScore *= 1.2; // 20% bonus for tools
      }
  
      // Only include results with decent matches
      if (bestScore >= 0.3) { // Threshold for fuzzy matches
        results.push({
          command,
          score: bestScore,
          matchType: bestMatchType,
          matchedField: bestMatchedField,
        });
      }
    });
  
    // Sort by score (highest first), then by category priority
    return results
      .sort((a, b) => {
        // Primary: Score
        if (b.score !== a.score) return b.score - a.score;
        
        // Secondary: Match type priority
        const matchTypePriority = { exact: 4, prefix: 3, fuzzy: 2, contains: 1 };
        if (matchTypePriority[b.matchType] !== matchTypePriority[a.matchType]) {
          return matchTypePriority[b.matchType] - matchTypePriority[a.matchType];
        }
        
        // Tertiary: Category priority
        const categoryPriority = { tools: 4, view: 3, edit: 2, file: 1 };
        return categoryPriority[b.command.category] - categoryPriority[a.command.category];
      })
      .map(result => result.command);
  };
  
  // Calculate match score for a single field
  const calculateMatchScore = (text: string, query: string): { score: number; matchType: SearchResult['matchType'] } => {
    const lowerText = text.toLowerCase();
    
    // Exact match (highest priority)
    if (lowerText === query) {
      return { score: 1.0, matchType: 'exact' };
    }
    
    // Prefix match (high priority)
    if (lowerText.startsWith(query)) {
      const lengthBonus = query.length / lowerText.length;
      return { score: 0.9 + lengthBonus * 0.1, matchType: 'prefix' };
    }
    
    // Contains match (medium priority)
    if (lowerText.includes(query)) {
      const positionBonus = 1 - (lowerText.indexOf(query) / lowerText.length);
      return { score: 0.7 + positionBonus * 0.2, matchType: 'contains' };
    }
    
    // Fuzzy match (lower priority)
    const similarity = similarityScore(text, query);
    if (similarity > 0.6) { // Only consider decent fuzzy matches
      return { score: similarity * 0.6, matchType: 'fuzzy' };
    }
    
    return { score: 0, matchType: 'contains' };
  };
  
  // Add more commands with better aliases for fuzzy matching
  export const commandRegistry: Command[] = [
    // Tools
    {
      id: 'selection-tool',
      name: 'Selection Tool',
      description: 'Select and manipulate objects',
      category: 'tools',
      aliases: ['select', 'selection', 'move', 'arrow', 'cursor', 'sel', 'pick', 'marquee'],
      action: () => console.log('Switch to selection tool'),
    },
    {
      id: 'line-tool',
      name: 'Line Tool',
      description: 'Draw straight lines',
      category: 'tools',
      aliases: ['line', 'draw', 'pen', 'stroke', 'ln', 'lin', 'segment', 'vector'],
      action: () => console.log('Switch to line tool'),
    },
    {
      id: 'rectangle-tool',
      name: 'Rectangle Tool',
      description: 'Draw rectangles and squares',
      category: 'tools',
      aliases: ['rectangle', 'rect', 'square', 'box', 'rec', 'sq', 'quad', 'polygon'],
      action: () => console.log('Switch to rectangle tool'),
    },
    {
      id: 'circle-tool',
      name: 'Circle Tool',
      description: 'Draw circles and ellipses',
      category: 'tools',
      aliases: ['circle', 'ellipse', 'round', 'oval', 'cir', 'circ', 'crcl', 'ellips'],
      action: () => console.log('Switch to circle tool'),
    },
    
    // View commands
    {
      id: 'zoom-in',
      name: 'Zoom In',
      description: 'Zoom into the canvas',
      category: 'view',
      aliases: ['zoomin', 'zoom+', 'larger', 'bigger', 'zin', 'closeup', 'magnify'],
      action: () => console.log('Zoom in'),
    },
    {
      id: 'zoom-out',
      name: 'Zoom Out',
      description: 'Zoom out of the canvas',
      category: 'view',
      aliases: ['zoomout', 'zoom-', 'smaller', 'zout', 'overview', 'wide'],
      action: () => console.log('Zoom out'),
    },
    {
      id: 'reset-zoom',
      name: 'Reset Zoom',
      description: 'Reset zoom to 100%',
      category: 'view',
      aliases: ['resetzoom', 'actualsize', '100%', 'normal', 'defaultzoom', 'origin'],
      action: () => console.log('Reset zoom'),
    },
    
    // Edit commands
    {
      id: 'clear-canvas',
      name: 'Clear Canvas',
      description: 'Clear all drawings',
      category: 'edit',
      aliases: ['clear', 'deleteall', 'clean', 'erase', 'wipe', 'reset'],
      action: () => console.log('Clear canvas'),
    },
    {
      id: 'toggle-grid',
      name: 'Toggle Grid',
      description: 'Show/hide grid',
      category: 'edit',
      aliases: ['grid', 'showgrid', 'hidegrid', 'ruler', 'snapgrid', 'guides'],
      action: () => console.log('Toggle grid'),
    },
  ];