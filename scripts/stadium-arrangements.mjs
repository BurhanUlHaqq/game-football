// Shorthand for a melody note is beat:scale-degree[:length in beats]. Each line is one bar.
// Program numbers use the zero-based General MIDI instrument map. The last voice colours the attack layer.
export const tunes = [
  {
    id: 'brass', title: 'Boots on Brass', bpm: 126, beats: 4, tonic: 58, swing: .16,
    instruments: [59, 0, 32, 71, 57], pans: [48, 42, 62, 82, 76],
    changes: [
      'I vi ii V I IV ii V', 'IV iv I VI7 ii II7 V I', 'vi III7 vi IV ii VI7 ii V',
    ],
    hooks: [
      '0:5:.42 .75:3:.25 1:5:.48 2:6:.35 2.75:8:.75',
      '.5:3:.36 1:2:.37 1.75:1:.74 3:5:.45',
      '0:3:.7 1:5:.30 1.5:6:.35 2:5:.8 3.5:3:.30',
      '.5:2:.38 1:3:.65 2.5:1:.9',
      '0:8:.32 .5:6:.32 1:5:.86 2.5:3:.34 3:2:.55',
      '.75:2:.24 1:3:.38 1.75:5:.65 3:1:.70',
      '0:3:1.15 1.5:4:.36 2:5:.33 2.75:6:.58',
      '0:5:.45 .75:3:.32 1.5:2:.40 2.5:1:.92',
    ],
  },
  {
    id: 'mango', title: 'Mango on the Wing', bpm: 116, beats: 4, tonic: 62, swing: 0,
    instruments: [12, 24, 33, 73, 114], pans: [44, 80, 64, 85, 44],
    changes: [
      'I IV I V vi IV ii V', 'IV V iii vi ii V I I', 'vi ii V I IV ii Vsus V',
    ],
    hooks: [
      '.5:3:.30 1:5:.40 1.75:6:.50 2.75:5:.32 3.5:3:.34',
      '0:2:.62 1:3:.32 1.5:5:.85 3:1:.55',
      '0:5:.32 .75:6:.30 1.5:8:.66 2.75:6:.40 3.5:5:.26',
      '.5:4:.34 1.25:3:.38 2:2:.48 3:1:.58',
      '0:3:.32 .75:5:.30 1.5:6:.72 3:8:.35 3.5:9:.27',
      '0:8:.75 1.25:6:.32 2:5:.65 3.5:3:.30',
      '.5:1:.35 1.25:3:.32 2:4:.36 2.75:5:1.00',
      '0:6:.42 1:5:.38 1.75:3:.50 2.75:1:.90',
    ],
  },
  {
    id: 'caper', title: 'The Biscuit Caper', bpm: 110, beats: 4, tonic: 62, swing: .07,
    instruments: [70, 45, 32, 71, 13], pans: [49, 82, 61, 78, 42],
    changes: [
      'i i iv V7 i bVI iiDim V7', 'iv bVII bIII bVI iv V7 i i', 'bVI iv i i iiDim V7 i V7',
    ],
    hooks: [
      '0:1:.19 .5:2:.18 1:3:.24 2.5:5:.48 3.5:3:.17',
      '0:2:.18 .5:1:.22 1.5:7:.30 3:1:.65',
      '.5:5:.22 1:5:.20 1.5:6:.24 2.75:3:.39',
      '0:4:.32 .75:3:.24 1.5:2:.50 3:1:.30',
      '0:1:.23 .5:3:.21 1:5:.32 2:8:.72 3.5:7:.20',
      '.5:6:.27 1:5:.26 1.75:3:.35 3:2:.54',
      '0:3:.20 .5:4:.19 1:3:.65 2.5:2:.25 3:5:.34',
      '0:5:.22 .5:3:.22 1.25:2:.27 2:1:.87',
    ],
  },
  {
    id: 'velcro', title: 'Velcro Sneakers', bpm: 103, beats: 4, tonic: 63, swing: .035,
    instruments: [4, 28, 33, 65, 7], pans: [51, 83, 62, 76, 39],
    changes: [
      'I7 I7 IV7 IV7 I7 vi ii V7', 'IV7 IV7 I7 VI7 ii V7 I7 I7', 'vi ii IV7 I7 bVII IV7 ii V7',
    ],
    hooks: [
      '.25:1:.30 1:3:.38 1.75:5:.22 2.25:6:.65 3.5:5:.27',
      '.5:3:.57 1.5:2:.22 2:1:.46 3.25:7:.36',
      '0:5:.22 .75:5:.23 1.25:6:.45 2.5:8:.67',
      '.25:6:.37 1:5:.60 2:3:.32 3:2:.45',
      '0:3:.37 .75:5:.25 1.5:7:.44 2.5:8:.68 3.5:5:.27',
      '.5:4:.36 1.25:3:.37 2:2:.23 2.75:1:.70',
      '.25:1:.28 .75:3:.25 1.5:5:.25 2:6:.68 3.25:3:.38',
      '0:5:.69 1.25:3:.29 2:2:.28 2.75:1:.77',
    ],
  },
  {
    id: 'kites', title: 'Kites over the Grandstand', bpm: 132, beats: 3, tonic: 65, swing: 0,
    instruments: [21, 46, 32, 73, 8], pans: [50, 81, 61, 78, 40],
    changes: [
      'I iii IV I vi ii V V7', 'IV iv I vi ii V I I', 'vi vi ii ii IV I ii V7',
    ],
    hooks: [
      '0:3:1.30 1.5:5:.42 2:8:.81',
      '0:7:.88 1:5:.81 2:3:.65',
      '0:4:.42 .5:5:.44 1:6:1.40',
      '0:5:.78 1:3:.87 2:2:.61',
      '0:6:1.28 1.5:8:.38 2:9:.74',
      '0:8:.88 1:6:.42 1.5:5:.36 2:3:.81',
      '0:2:.88 1:3:.86 2:5:.76',
      '0:4:.46 .5:3:.43 1:2:.47 1.5:1:1.08',
    ],
  },
  {
    id: 'popcorn', title: 'Popcorn at the Post', bpm: 144, beats: 4, tonic: 60, swing: .03,
    instruments: [66, 27, 34, 16, 56], pans: [51, 38, 63, 84, 77],
    changes: [
      'I I IV V I vi ii V', 'IV V I vi IV V I I', 'vi iii IV I ii IV Vsus V',
    ],
    hooks: [
      '0:5:.40 1:5:.22 1.5:3:.25 2:1:.70 3.5:2:.32',
      '0:3:.51 1:5:.22 1.5:6:.24 2.5:5:.68',
      '.5:8:.36 1:6:.28 1.5:5:.35 2.5:3:.72',
      '0:4:.49 1:3:.22 1.5:2:.33 2.5:1:.92',
      '0:3:.30 .5:5:.27 1:8:.62 2:6:.27 2.5:5:.76',
      '.5:3:.36 1:2:.30 1.5:1:.62 3:5:.39',
      '0:2:.36 .5:4:.35 1:6:.62 2.5:5:.62',
      '0:5:.24 .5:3:.33 1.25:2:.43 2:1:1.14',
    ],
  },
];

// Each eight-bar movement has its own melodic order, orchestration and harmonic route.
export const movements = [
  { name: 'head',     chords: 0, hooks: [0,1,0,3,2,1,6,7] },
  { name: 'answer',   chords: 1, hooks: [4,5,2,3,6,5,0,7] },
  { name: 'walk',     chords: 0, hooks: [2,3,4,5,0,3,6,7] },
  { name: 'solo',     chords: 2, hooks: [6,1,4,3,2,5,6,7] },
  { name: 'bridge',   chords: 2, hooks: [4,3,6,1,4,5,2,7] },
  { name: 'hush',     chords: 1, hooks: [1,5,0,3,6,1,2,7] },
  { name: 'reprise',  chords: 0, hooks: [0,3,4,1,2,5,0,7] },
  { name: 'home',     chords: 1, hooks: [6,5,0,1,4,3,2,7] },
];
