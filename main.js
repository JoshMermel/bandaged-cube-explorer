// This is a program for exploring the shape space of bandaged 3x3x3 Rubik's
// cubes. Internally, each cube is represented as a bitset representing the
// presence of absence of bonds between cubies. The mapping from
// indices-in-the-bitset to bond was chosen to match the one used by Andreas
// Nortman.
// This representation is both compact and easy for the computer to work with
// but leads to code and cube-names that are hard for humans to grok. I've
// attempted to excessively comment this file as a resource to others trying to
// work with bandaged 3x3x3s in software in the future.

// Ideas for future work
//   graph simplification
//   better arrowhead placement
//   Making nodes bigger when there are more of them so they look good zoomed.

/////////////////
// Global vars //
/////////////////

// In order to make resetting simpler, a few key vars are made global.
var simulation;
// the page setup is a non-interactive svg for the legend covered by an
// interactive svg fro the graph. This lets us decouple movement and scaling on
// the interactive svg from the logic of drawing the legend's sizing and
// position.
var svg, svg_legend;

var width = window.innerWidth,
  height = window.innerHeight;

/////////////////////
// Generic Helpers //
/////////////////////

// Takes a list of BigInt offsets and returns a corresponding bitset as a BigInt.
function MakeBitSet(lst) {
  let ret = 0n;
  for (let i of lst) {
    ret |= (1n << i);
  }
  return ret;
}

// Gets bit at index |idx| from a bitset.
function GetBit(cube, idx) {
  return cube & (1n << idx);
}

// Sets the bit at index |idx| to match the truthiness of |val|.
function SetBit(cube, idx, val) {
  let mask = 1n << idx;
  if (val) {
    return cube | mask;
  } else {
    return cube & ~mask;
  }
}

// cycles bits according to perms.
// Could maybe be optimized by some special purpose code for each permutation
// from http://programming.sirrida.de/bit_perm.html#calculator
function ApplyPermutations(cube, permutations) {
  for (let perm of permutations) {
    if (perm.length == 0) {
      break;
    }
    let start = GetBit(cube, perm[0]);
    for (let i = 0; i < perm.length - 1; i++) {
      cube = SetBit(cube, perm[i], GetBit(cube, perm[i+1]));
    }
    cube = SetBit(cube, perm[perm.length - 1], start);
  }
  return cube;
}

///////////////////////////////////////
// Methods for manipulating the cube //
///////////////////////////////////////

// Each list corresponds to the set of bonds which would block that face if they
// are present. The helper converts them to a bitset which allows us to check if
// a face is blocked with a single bitwise operation.
const blockers = {
  b : MakeBitSet([ 7n,  8n,  9n, 28n, 29n, 30n, 49n, 50n, 51n]),
  l : MakeBitSet([ 1n,  6n, 11n, 22n, 27n, 32n, 43n, 48n, 53n]),
  u : MakeBitSet([33n, 34n, 35n, 36n, 37n, 38n, 39n, 40n, 41n]),
  r : MakeBitSet([ 0n,  5n, 10n, 21n, 26n, 31n, 42n, 47n, 52n]),
  d : MakeBitSet([12n, 13n, 14n, 15n, 16n, 17n, 18n, 19n, 20n]),
  f : MakeBitSet([ 2n,  3n,  4n, 23n, 24n, 25n, 44n, 45n, 46n]),
}


// Cube is a BigInt bitset. Turn is one of {b,l,u,r,d,f}
// Returns whether that face is blocked.
function CanDoTurn(cube, turn) {
  return !(cube & blockers[turn])
}

// CanDoTurn must be called before calling this method.
// Cube is a BigInt bitset. Turn is one of {b,l,u,r,d,f}
// Returns a bitset representing the cube after that turn has been performed
// Turns can be thought of as bit permutation that move bonds to new locations
// which means I can use my favorite tool (
function DoTurn(cube, turn) {
  switch (turn) {
    case 'b':
      return ApplyPermutations(cube, [
        [10n, 20n, 53n, 39n],
        [11n, 41n, 52n, 18n],
        [19n, 32n, 40n, 31n]
      ]);
    case 'l':
      return ApplyPermutations(cube, [
        [ 4n, 35n, 51n, 20n],
        [ 9n, 14n, 46n, 41n],
        [17n, 25n, 38n, 30n]
      ]);
    case 'u':
      return ApplyPermutations(cube, [
        [42n, 49n, 53n, 46n],
        [43n, 44n, 52n, 51n],
        [45n, 47n, 50n, 48n]
      ]);
    case 'r':
      return ApplyPermutations(cube, [
        [ 2n, 18n, 49n, 33n],
        [ 7n, 39n, 44n, 12n],
        [15n, 28n, 36n, 23n]
      ]);
    case 'd':
      return ApplyPermutations(cube, [
        [ 0n,  4n, 11n,  7n],
        [ 1n,  9n, 10n,  2n],
        [ 3n,  6n,  8n,  5n]
      ]);
    case 'f':
      return ApplyPermutations(cube, [
        [ 0n, 33n, 43n, 14n],
        [ 1n, 12n, 42n, 35n],
        [13n, 21n, 34n, 22n]
      ]);
  }
  console.log('unexpected turn id, ', turn); 
  return cube;
}

// colors
let blue = '#3b6ecc';
let orange = '#ff5900';
let black = '#000000';
let gray = '#d3d3d3';
let red = '#b90000';
let yellow = '#ffd500';
let green = '#3bcc64';

function FaceToColor(c) {
  switch(c) {
    case 'b':
      return blue;
    case 'l':
      return orange;
    case 'u':
      return black;
    case 'r':
      return red;
    case 'd':
      return yellow;
    case 'f':
      return green;
  }
  console.log('unexpected turn id, ', turn); 
}

// Explores the state space starting from Cube.
// Returns an object containing Nodes and Links, appropriate for use with
// d3.js's force simulation library.
function BuildGraph(cube) {
  let i = 0;
  let nodes = [{size: 11, id: cube, color: '#ff7f0e'}];
  let node_set = new Set(); // all nodes so far and their ints
  let links = [];

  node_set.add(cube);
  while (i < nodes.length) {
    let to_explore = nodes[i].id;
    for (let c of ['b', 'l', 'u', 'r', 'd', 'f']) {
      if (CanDoTurn(to_explore, c)) {
        let turned = DoTurn(to_explore, c);
        if (!node_set.has(turned)) {
          nodes.push({size: 11, id: turned, color: '#1f77b4'});
          node_set.add(turned);
        }
        links.push({
          source: to_explore,
          target: turned,
          color: FaceToColor(c)
        });
      }
    }
    i++;
  }

  return {nodes: nodes, links: links};
}

//////////////////////////////////////////////////////////////////////
// Helpers for drawing an unfolded outline of the cube on mouseover //
//////////////////////////////////////////////////////////////////////

// Unscaled coordinates for the lines forming the outline of a face.
const drawFaceOutlineTable = [
  {x1: 0, y1: 0, x2: 3, y2: 0},
  {x1: 3, y1: 0, x2: 3, y2: 3},
  {x1: 3, y1: 3, x2: 0, y2: 3},
  {x1: 0, y1: 3, x2: 0, y2: 0},
]

// Unscaled coordinates for the lines that form the cuts of a face.
const drawFaceCutsTable = [
  {x1: 1, y1: 0, x2: 1, y2: 1},
  {x1: 2, y1: 0, x2: 2, y2: 1},
  {x1: 0, y1: 1, x2: 1, y2: 1},
  {x1: 1, y1: 1, x2: 2, y2: 1},
  {x1: 2, y1: 1, x2: 3, y2: 1},
  {x1: 1, y1: 1, x2: 1, y2: 2},
  {x1: 2, y1: 1, x2: 2, y2: 2},
  {x1: 0, y1: 2, x2: 1, y2: 2},
  {x1: 1, y1: 2, x2: 2, y2: 2},
  {x1: 2, y1: 2, x2: 3, y2: 2},
  {x1: 1, y1: 2, x2: 1, y2: 3},
  {x1: 2, y1: 2, x2: 2, y2: 3},
]

// Unscaled coordinates for lines forming an X over the center of a face.
const drawFaceCutsCenterTable = [
  {x1: 1.2, y1: 1.2, x2:1.8, y2:1.8},
  {x1: 1.2, y1: 1.8, x2:1.8, y2:1.2},
]

// Helper for drawing lines to the legend.
function DrawLegendLine(xoffset, yoffset, scale, ends, width) {
  svg_legend.append('line')
    .attr('x1', ends.x1 * scale + xoffset)
    .attr('y1', ends.y1 * scale + yoffset)
    .attr('x2', ends.x2 * scale + xoffset)
    .attr('y2', ends.y2 * scale + yoffset)
    .attr('stroke-width', width)
    .attr('stroke', 'black')
    .attr('class', 'legend');
}

// Helper for drawing colored squares to the legend.
function DrawLegendColor(xoffset, yoffset, scale, color, present) {
  svg_legend.append('rect')
    .attr('x', xoffset)
    .attr('y', yoffset)
    .attr('width', scale)
    .attr('height', scale)
    .attr('fill', color)
    .attr('stroke', color)
    .attr('stroke-width', '1')
    .attr('class', 'legend');
}

// Helper for drawing a face of the cube.
// |bonds| is a list of Bigint indices to into the cube which indicate whether
// each bond is present or not. They are ordered as follows:
//     |    |    
//     0    1    
//     |    |    
// -2--+-3--+-4--
//     |    |    
//     5    6    
//     |    |    
// -7--+-8--+-9--
//     |    |    
//     10   11   
//     |    |    
// There is also an element at index 12 which indicates whether the center is
// fused to the core.
function DrawLegendFace(cube, xoffset, yoffset, scale, bonds, color) {
  // Determines which stickers are fused to the center so they can be colored
  // in.
  let center_colors = [
    (GetBit(cube, bonds[0]) && GetBit(cube, bonds[3])) || (GetBit(cube, bonds[2]) && GetBit(cube, bonds[5])),
    GetBit(cube, bonds[3]),
    (GetBit(cube, bonds[1]) && GetBit(cube, bonds[3])) || (GetBit(cube, bonds[4]) && GetBit(cube, bonds[6])),
    GetBit(cube, bonds[5]),
    true,
    GetBit(cube, bonds[6]),
    (GetBit(cube, bonds[5]) && GetBit(cube, bonds[7])) || (GetBit(cube, bonds[5]) && GetBit(cube, bonds[8])),
    GetBit(cube, bonds[8]),
    (GetBit(cube, bonds[6]) && GetBit(cube, bonds[9])) || (GetBit(cube, bonds[8]) && GetBit(cube, bonds[11])),
  ]

  // Draw center colors. This happens first to avoid drawing over outlines or
  // bonds.
  for (let i = 0; i < 9; i++) {
    if (center_colors[i]) {
      DrawLegendColor(xoffset + ((i%3) * scale), yoffset + (~~(i/3) * scale), scale, color);
    }
  }

  // Draw outline.
  for (let l of drawFaceOutlineTable) {
    DrawLegendLine(xoffset, yoffset, scale, l, 2);
  }

  // Draw interior cuts when no bond exists
  for (let i = 0; i < bonds.length-1; ++i) {
    if (GetBit(cube, bonds[i]) == 0n) {
      DrawLegendLine(xoffset, yoffset, scale, drawFaceCutsTable[i], 1);
    }
  }

  // Draw an X if the center is blocked.
  if (GetBit(cube, bonds[12]) != 0n) {
    for (let l of drawFaceCutsCenterTable) {
      DrawLegendLine(xoffset, yoffset, scale, l, 1);
    }
  }
}

function DrawLegend(xoffset, yoffset, scale, cube) {
  console.log('drawing legend for cube ', cube);
  // Unscaled offsets of how the faces are laid out relative to one another.
  // Each face is a 3x3 square before scaling.
  // Also indices into the cube bitset of where to look for presence/absence of
  // cuts.
  const FaceData = [
    {x:3, y:0, cuts:[11n, 10n, 20n, 19n, 18n, 32n, 31n, 41n, 40n, 39n, 53n, 52n, 29n], color: blue},   // B
    {x:0, y:3, cuts:[20n, 41n,  9n, 30n, 51n, 17n, 38n,  4n, 25n, 46n, 14n, 35n, 27n], color: orange}, // L
    {x:3, y:3, cuts:[53n, 52n, 51n, 50n, 49n, 48n, 47n, 46n, 45n, 44n, 43n, 42n, 37n], color: gray},   // U
    {x:6, y:3, cuts:[39n, 18n, 49n, 28n,  7n, 36n, 15n, 44n, 23n,  2n, 33n, 12n, 26n], color: red},    // R
    {x:9, y:3, cuts:[10n, 11n,  7n,  8n,  9n,  5n,  6n,  2n,  3n,  4n,  0n,  1n, 16n], color: yellow}, // D
    {x:3, y:6, cuts:[43n, 42n, 35n, 34n, 33n, 22n, 21n, 14n, 13n, 12n,  1n,  0n, 24n], color: green},  // F
  ]

  for (let face of FaceData) {
    DrawLegendFace(cube, face.x * scale + xoffset, face.y * scale + yoffset, scale, face.cuts, face.color);
  }
}


////////////////////////////////////////////////////
// Setting up the parameters for the graph layout //
////////////////////////////////////////////////////

// The crux of this whole program. This function takes a graph containing a list
// of nodes and links and draws it. It also sets up all the listeners for
// interactivity like dragging and hovering.
function drawGraph(graph) {
  svg_legend = d3.select('body').append('svg')
    .attr('viewBox', [0, 0, width, height]);
  svg = d3.select('body').append('svg')
    .attr('viewBox', [0, 0, width, height])
    .call(d3.zoom().on('zoom', function () {
      svg.attr('transform', d3.event.transform)
    }))
    .append('g')

  // stolen from stackoverflow. Dunno why this works.
  svg.append('defs').append('marker')
    .attr('id','arrowhead')
    .attr('viewBox','-0 -5 10 10')
     .attr('refX',23) // x coordinate for the reference point of the marker. If circle is bigger, this need to be bigger.
     .attr('refY',0)
     .attr('orient','auto')
        .attr('markerWidth',8)
        .attr('markerHeight',8)
        .attr('xoverflow','visible')
    .append('svg:path')
    .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
    .attr('fill', '#999')
    .style('stroke','none');

  simulation = d3.forceSimulation()
    .force('link', d3.forceLink().distance(10).strength(1.5))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(width / 2, height / 2));

  let nodes = graph.nodes;
  let nodeById = d3.map(nodes, function(d) { return d.id; });
  let link = graph.links;
  let bilinks = [];

  link.forEach(function(l) {
    let s = l.source = nodeById.get(l.source),
      t = l.target = nodeById.get(l.target),
      i = {}; // intermediate node
    nodes.push(i);
    link.push({source: s, target: i}, {source: i, target: t});
    bilinks.push([s, i, t, l.color]);
  });


  let links = svg.selectAll('.link')
    .data(bilinks)
    .enter().append('path')
    .attr('class', 'link')
    .style('stroke', function(d){ return d[3]; })
    .attr('stroke-width', 1.5)
    .attr('marker-end','url(#arrowhead)');

  let node = svg.selectAll('.node')
     // Use presence size field to distinguish real nodes from intermediate ones.
    .data(nodes.filter(function(d) { return d.size; }))
    .enter().append('circle')
    .attr('class', 'node')
    .attr('r', function(d) { return d.size; })
    .attr('fill', function(d) { return d.color; })
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended))
    .on('mouseover', focus)
    .on('mouseout', unfocus);
    
  let circles = node.append('circle')
      .attr('r', 10)
      .attr('fill', function(d) { return d.color; })
      .call(d3.drag()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended));

  simulation
      .nodes(graph.nodes)
      .on('tick', ticked);

  simulation.force('link')
      .links(graph.links);

  function ticked() {
    links.attr('d', positionLink);
    node.attr('transform', positionNode);
  }
}

// Helpers for drawing and erasing the legend from a background svg.
function focus(d) {
  let scale = Math.min(width / 4, height / 3) / 12
  let xoffset = (d.x > width / 2) ? 50 : width - (12 * scale) - 50;
  let yoffset = (d.y > height / 2) ? 50 : height - (9 * scale) - 50;
  DrawLegend(xoffset, yoffset, scale, d.id);
}
function unfocus() {
  svg_legend.selectAll('*.legend').remove();
}

// The way we draw self links is a hack where we draw a big arc from the center
// of the circle to a point that's extremely close by. Modifying this point
// modifies the angle that the self-edge exits the circle. We can use this to
// avoid multiple self edges from the same node overlapping.
function ColorToAdjustment(c) {
  switch(c) {
    case blue:
      return {x: 1, y: 1};
    case orange:
      return {x: -1, y: 1};
    case black:
      return {x: 2, y: 0};
    case red:
      return {x: -2, y: 0};
    case yellow:
      return {x: 1, y: -1};
    case green:
      return {x: -1, y: -1};
  }
  console.log('unexpected turn id, ', turn); 
  return {x: 10, y: 10};
}

// https://stackoverflow.com/a/17687907
function positionLink(d) {
  if (d[0] == d[2]) {
    let adjustment = ColorToAdjustment(d[3]);
    return 'M' + d[0].x+ ',' + d[0].y+ 'A20,20 0,1,0 '  + (d[0].x + adjustment.x) + ',' + (d[2].y + adjustment.y);
  }
  return 'M' + d[0].x + ',' + d[0].y
       + 'S' + d[1].x + ',' + d[1].y
       + ' ' + d[2].x + ',' + d[2].y;
}

function positionNode(d) {
  return 'translate(' + d.x + ',' + d.y + ')';
}

function dragstarted(d) {
  if (!d3.event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(d) {
  // I don't know why I can't use d3.event.x and d3.event.y here but grabbing
  // the mouse coordinates instead seems to work.
  let coordinates = d3.mouse(svg.node());
  d.fx = coordinates[0];
  d.fy = coordinates[1];
}

function dragended(d) {
  if (!d3.event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}

// TODO(jmerm): include more named cubes.
const named_cubes = new Map([
  ['stonehenge', 0x88000B42FB5A1n],
  ['1x3x3', 0x318C018C600C63n],
]);

function TryLoadGraph(str) {
  let id = 0;
  // check if it is the name of a named cube
  if (named_cubes.has(str.toLowerCase())) {
    id = named_cubes.get(str.toLowerCase());
  } else {
    // check if it can be parsed as an int signatures
    try {
      id = BigInt(str);
    } catch (error) {
      alert(error);
      return;
    }
  }

  if (id < 0) {
    alert('input must be between 0 and (2^57)-1)');        
    return;
  }

  d3.selectAll('svg').remove();
  drawGraph(BuildGraph(id));
  window.history.pushState({"html":"index.html"},"", "/" + str);
}

function LoadGraph(ele) {
  if(event.key !== 'Enter') {
    return;
  }
  TryLoadGraph(ele.value);
}

// TODO(jmerm): randomize from a bunch of nice IDs.
function defaultId() {
  return '0x108BF0846005A1';
}

window.onload = function() {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  let id = defaultId();
  if (urlParams.has('id')) {
    id = urlParams.get('id')
  }

  document.getElementById('input').value = id;

  // Initialize page.
  TryLoadGraph(id);
}

// nice graphs;
//   0x100400C7AC043D - very spread out
//   0x8000F43237A1 - great 2 way symmetry
//   0x300F9180600C23 - cool cubes
//   0x10000000000002	 - impossibly tangled
//   0x80200084 - good layers
//   0x182800008 - 4 way symmetry
//   0x180002C00 - 3 way symmetry
//   0xC61 - 2 way symmetry
//   0xC23 - 2 way symmetry (small)
//   0x180608040 - very compact
