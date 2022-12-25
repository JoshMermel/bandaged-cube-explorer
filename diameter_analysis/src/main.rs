#![warn(clippy::all, clippy::pedantic)]
// Run with `cargo clippy --all -- -D warnings`.
#![deny(missing_docs)]
//! Utils for analyzing the graphs of bandaged 3x3x3 Configurations.

use lazy_static::lazy_static;
use rayon::iter::*;
use std::cmp;
use std::collections::{HashMap, VecDeque};

lazy_static! {
    /// Each bitset represnts the set of bonds that block a specific face. Bitsets can be looked up
    /// using Blockers::get.
    static ref BLOCKERS: Blockers = Blockers::Blockers([
        make_bitset(&[33, 34, 35, 36, 37, 38, 39, 40, 41]), // U
        make_bitset(&[0, 5, 10, 21, 26, 31, 42, 47, 52]),   // R
        make_bitset(&[2, 3, 4, 23, 24, 25, 44, 45, 46]),    // F
        make_bitset(&[12, 13, 14, 15, 16, 17, 18, 19, 20]), // D
        make_bitset(&[1, 6, 11, 22, 27, 32, 43, 48, 53]),   // L
        make_bitset(&[7, 8, 9, 28, 29, 30, 49, 50, 51]),    // B
    ]);

    static ref QTM: Metric = Metric::Quarter([TurnType::Forward, TurnType::Backward]);
    static ref HTM: Metric = Metric::Half([TurnType::Forward, TurnType::Backward, TurnType::Double]);

    /// Each entry maps from a turn to a cycle-notation permutation that describes how bonds are modified by that turn.
    static ref PERMUTATIONS: HashMap<Turn, Vec<Vec<i64>>> = HashMap::from([
        (Turn::Turn(Face::U, TurnType::Forward) , vec![ vec![42, 49, 53, 46], vec![43, 44, 52, 51], vec![45, 47, 50, 48], ]),
        (Turn::Turn(Face::U, TurnType::Backward) , vec![ vec![42, 46, 53, 49], vec![43, 51, 52, 44], vec![45, 48, 50, 47], ]),
        (Turn::Turn(Face::U, TurnType::Double) , vec![ vec![42, 53], vec![46, 49], vec![43, 52], vec![51, 44], vec![45, 50], vec![48, 47], ]),
        (Turn::Turn(Face::R, TurnType::Forward) , vec![ vec![2, 18, 49, 33], vec![7, 39, 44, 12], vec![15, 28, 36, 23], ]),
        (Turn::Turn(Face::R, TurnType::Backward) , vec![ vec![2, 33, 49, 18], vec![7, 12, 44, 39], vec![15, 23, 36, 28], ]),
        (Turn::Turn(Face::R, TurnType::Double) , vec![ vec![2, 49], vec![33, 18], vec![7, 44], vec![12, 39], vec![15, 36], vec![23, 28], ]),
        (Turn::Turn(Face::F, TurnType::Forward) , vec![ vec![0, 33, 43, 14], vec![1, 12, 42, 35], vec![13, 21, 34, 22], ]),
        (Turn::Turn(Face::F, TurnType::Backward) , vec![ vec![0, 14, 43, 33], vec![1, 35, 42, 12], vec![13, 22, 34, 21], ]),
        (Turn::Turn(Face::F, TurnType::Double) , vec![ vec![0, 43], vec![14, 33], vec![1, 42], vec![35, 12], vec![13, 34], vec![22, 21], ]),
        (Turn::Turn(Face::L, TurnType::Forward) , vec![ vec![4, 35, 51, 20], vec![9, 14, 46, 41], vec![17, 25, 38, 30], ]),
        (Turn::Turn(Face::L, TurnType::Backward) , vec![ vec![4, 20, 51, 35], vec![9, 41, 46, 14], vec![17, 30, 38, 25], ]),
        (Turn::Turn(Face::L, TurnType::Double) , vec![ vec![4, 51], vec![20, 35], vec![9, 46], vec![41, 14], vec![17, 38], vec![30, 25], ]),
        (Turn::Turn(Face::D, TurnType::Forward) ,  vec![vec![0, 4, 11, 7], vec![1, 9, 10, 2], vec![3, 6, 8, 5]] ),
        (Turn::Turn(Face::D, TurnType::Backward) , vec![vec![0, 7, 11, 4], vec![1, 2, 10, 9], vec![3, 5, 8, 6]] ),
        (Turn::Turn(Face::D, TurnType::Double) , vec![ vec![0, 11], vec![7, 4], vec![1, 10], vec![2, 9], vec![3, 8], vec![5, 6], ]),
        (Turn::Turn(Face::B, TurnType::Forward) , vec![ vec![10, 20, 53, 39], vec![11, 41, 52, 18], vec![19, 32, 40, 31], ]),
        (Turn::Turn(Face::B, TurnType::Backward) , vec![ vec![10, 39, 53, 20], vec![11, 18, 52, 41], vec![19, 31, 40, 32], ]),
        (Turn::Turn(Face::B, TurnType::Double) , vec![ vec![10, 53], vec![39, 20], vec![11, 52], vec![18, 41], vec![19, 40], vec![31, 32], ]),
    ]);


    /// Each entry maps from an Orientation to a cycle-notation permutation that describes how bonds are modified by that orientation.
    static ref ORIENTATIONS: HashMap<Orientation, Vec<Vec<i64>>> = HashMap::from([
        (Orientation::Y, vec![
            vec![0, 4, 11, 7], vec![1, 9, 10, 2], vec![3, 6, 8, 5],
            vec![12, 14, 20, 18], vec![13, 17, 19, 15], vec![21, 25, 32, 28],
            vec![22, 30, 31, 23], vec![24, 27, 29, 26], vec![33, 35, 41, 39],
            vec![34, 38, 40, 36], vec![42, 46, 53, 49], vec![43, 51, 52, 44],
            vec![45, 48, 50, 47],
        ]),
        (Orientation::Z, vec![
             vec![0, 14, 43, 33], vec![1, 35, 42, 12], vec![2, 4, 46, 44],
             vec![3, 25, 45, 23], vec![5, 17, 48, 36], vec![6, 38, 47, 15],
             vec![7, 9, 51, 49], vec![8, 30, 50, 28], vec![10, 20, 53, 39],
             vec![11, 41, 52, 18], vec![13, 22, 34, 21], vec![16, 27, 37, 26],
             vec![19, 32, 40, 31],
        ]),
        (Orientation::Mirror, vec![
             vec![0, 1], vec![2, 4], vec![5, 6], vec![7, 9], vec![10, 11], vec![12, 14],
             vec![15, 17], vec![18, 20], vec![21, 22], vec![23, 25], vec![26, 27], vec![28, 30],
             vec![31, 32], vec![33, 35], vec![36, 38], vec![39, 41], vec![42, 43], vec![44, 46],
             vec![47, 48], vec![49, 51], vec![52, 53],
        ]),
    ]);

    static ref FACES: [Face; 6] = [Face::U, Face::R, Face::F, Face::D, Face::L, Face::B];
}

#[cfg(test)]
mod tests {

    #[test]
    fn test_make_bitset() {
        use crate::make_bitset;
        assert_eq!(1, make_bitset(&[0]));
        assert_eq!(8, make_bitset(&[3]));
        assert_eq!(9, make_bitset(&[0, 3]));
    }

    #[test]
    fn test_can_turn_face() {
        use crate::can_turn_face;
        use crate::Face;
        assert_eq!(true, can_turn_face(1, Face::U));
        assert_eq!(false, can_turn_face(1, Face::R));
    }

    #[test]
    fn test_get_bit() {
        use crate::get_bit;
        assert_eq!(true, get_bit(8, 3));
        assert_eq!(false, get_bit(8, 2));
    }

    #[test]
    fn test_set_bit() {
        use crate::set_bit;
        assert_eq!(12, set_bit(8, 2, true));
        assert_eq!(8, set_bit(8, 3, true));
        assert_eq!(0, set_bit(8, 3, false));
    }

    #[test]
    fn test_do_turn() {
        // TODO(jmerm): this.
        assert_eq!(1, 1);
    }

    #[test]
    fn test_do_orientation() {
        // TODO(jmerm): this.
        assert_eq!(1, 1);
    }

    #[test]
    fn test_normalize_orientation() {
        // TODO(jmerm): this.
        assert_eq!(1, 1);
    }

    #[test]
    fn test_breadth_first_search() {
        // TODO(jmerm): this.
        assert_eq!(1, 1);
    }
}

//////////////////////////////////
// Helpers for bit manipulation //
//////////////////////////////////

/// Gets bit at index |idx| from a bitset.
fn get_bit(cube: i64, idx: i64) -> bool {
    cube & (1 << idx) != 0
}

/// Sets the bit at index |idx| to match the truthiness of |val|.
fn set_bit(cube: i64, idx: i64, val: bool) -> i64 {
    if val {
        cube | (1 << idx)
    } else {
        cube & !(1 << idx)
    }
}

/// Takes a vector of offsets and encodes them into an i64 bitset.
fn make_bitset(indices: &[i64]) -> i64 {
    indices.iter().fold(0, |ret, i| ret | 1 << i)
}

// Could maybe be optimized by some special purpose code for each permutation
// from http://programming.sirrida.de/bit_perm.html#calculator
/// cycles bits according to perms.
fn apply_permutation(mut cube: i64, permutations: &[Vec<i64>]) -> i64 {
    permutations
        .iter()
        .filter(|p| !p.is_empty())
        .for_each(|perm| {
            let start = get_bit(cube, perm[0]);
            for i in 0..perm.len() - 1 {
                cube = set_bit(cube, perm[i], get_bit(cube, perm[i + 1]));
            }
            cube = set_bit(cube, perm[perm.len() - 1], start);
        });
    cube
}

/////////////////////////////////////////
// Utils for turning faces on the cube //
/////////////////////////////////////////

/// Stores data on which bonds block which faces.
enum Blockers {
    Blockers([i64; 6]),
}

impl Blockers {
    /// Returns an i64 bitset encoding which bonds block |face| from turning.
    fn get(&self, face: Face) -> i64 {
        match self {
            Self::Blockers(arr) => arr[face as usize],
        }
    }
}

/// All the faces on a Rubik's cube.
#[derive(Clone, Copy, PartialOrd, Ord, Eq, PartialEq, Hash)]
enum Face {
    U,
    R,
    F,
    D,
    L,
    B,
}

/// All the ways a face of Rubik's cube can turn.
#[derive(Clone, Copy, Hash, Eq, PartialEq)]
enum TurnType {
    Forward,
    Backward,
    Double,
}

/// All the turns that can be done on a Rubik's cube.
#[derive(Hash, PartialEq, Eq)]
enum Turn {
    Turn(Face, TurnType),
}

/// All the kinds of move that count a 1 turn.
enum Metric {
    Quarter([TurnType; 2]),
    Half([TurnType; 3]),
}

impl Metric {
    pub fn turns(&self) -> std::slice::Iter<TurnType> {
        match self {
            Self::Quarter(turns) => turns.iter(),
            Self::Half(turns) => turns.iter(),
        }
    }
}

/// Returns whether |turn| is blocked on |cube|.
fn can_turn_face(cube: i64, face: Face) -> bool {
    cube & BLOCKERS.get(face) == 0
}

// can_turn_face must be called before calling this method.
/// Returns a bitset representing the cube after |turn| has been performed
fn do_turn(cube: i64, turn: &Turn) -> i64 {
    apply_permutation(cube, PERMUTATIONS.get(turn).unwrap())
}

////////////////////////////////////
// Utils for reorienting the cube //
////////////////////////////////////

#[derive(Hash, PartialEq, Eq, Copy, Clone)]
enum Orientation {
    Y,
    Z,
    Mirror,
}

/// Returns a bitset representing the cube after being reoriented according to |orientation|.
fn do_orientation(cube: i64, orientation: Orientation) -> i64 {
    apply_permutation(cube, ORIENTATIONS.get(&orientation).unwrap())
}

// Helper for normalizing cube orientation. Checks all orientations where the
// UF, UL, or FL edge is in the UF position (oriented either way).
fn normalize_orientation_corner(mut cube: i64) -> i64 {
    let mut min = cube;
    for _ in 0..3 {
        cube = do_orientation(cube, Orientation::Y);
        min = cmp::min(min, cube);
        cube = do_orientation(cube, Orientation::Z);
        min = cmp::min(min, cube);
    }
    min
}

// Helper for normalizing cube orientation. Checks all orientations where the
// UF, UL, FL, UB, UR, or RB edges are in the UF position (in either
// orientaiton).
fn normalize_orientation_face(cube: i64) -> i64 {
    let y2 = do_orientation(do_orientation(cube, Orientation::Y), Orientation::Y);
    cmp::min(
        normalize_orientation_corner(cube),
        normalize_orientation_corner(y2),
    )
}

// Helper for normalizing cube orientation. Checks all orientations of the input
// (but not its mirror image) and returns whichever is smallest.
fn normalize_orientation_no_mirror(cube: i64) -> i64 {
    let z2 = do_orientation(do_orientation(cube, Orientation::Z), Orientation::Z);
    cmp::min(
        normalize_orientation_face(cube),
        normalize_orientation_face(z2),
    )
}

// Checks all 48 orientations of the cube including its mirror images and
// returns whichever one is smallest.
fn normalize_orientation(cube: i64) -> i64 {
    let mirror = do_orientation(cube, Orientation::Mirror);
    cmp::min(
        normalize_orientation_no_mirror(cube),
        normalize_orientation_no_mirror(mirror),
    )
}

////////////////////////////
// Utils for graph search //
////////////////////////////

/// A struct for holding data during BFS
#[derive(typed_builder::TypedBuilder)]
struct Node {
    /// A bandaged signiture.
    cube: i64,

    /// The depth from the start of the BFS
    #[builder(default = 0)]
    depth: u16,

    /// The last face that was turned. This is an optimization to avoid duplicate work.
    #[builder(default=None)]
    last_face: Option<Face>,
}

/// Helper for saying whether turning |face| is unnecessary because the result has already been found.
fn is_wasteful(face: Face, last_face: Option<Face>, metric: &Metric) -> bool {
    match (metric, face, last_face) {
        // In HTM, there's no need to ever turn a face twice in a row.
        // In QTM we can't take the same shortcut.
        (Metric::Half(_), _, None) | (Metric::Quarter(_), _, _) => false,
        (Metric::Half(_), a, Some(b)) => a == b,
    }
}

/// Returns a map from each reachable state to the shorest path from |initial| to that state
fn breadth_first_search(initial: i64, metric: &Metric) -> HashMap<i64, u16> {
    let mut seen_nodes = HashMap::from_iter([(initial, 0)]);
    let mut queue = VecDeque::from_iter([Node::builder().cube(initial).build()]);

    while let Some(Node {
        cube,
        depth,
        last_face,
    }) = queue.pop_front()
    {
        for face in FACES
            .into_iter()
            .filter(|face| can_turn_face(cube, *face) && !is_wasteful(*face, last_face, metric))
        {
            for turn_type in metric.turns() {
                let turned = do_turn(cube, &Turn::Turn(face, *turn_type));
                let _ = seen_nodes.entry(turned).or_insert_with(|| {
                    // println!("adding {} at depth {}", turned, depth+1);
                    queue.push_back(Node {
                        cube: turned,
                        depth: depth + 1,
                        last_face: Some(face),
                    });
                    depth + 1
                });
            }
        }
    }

    seen_nodes
}

#[derive(Clone)]
struct Stats {
    max_dist: u16,
    max_start: i64,
    max_end: i64,
    radius: u16,
    center: i64,
}
impl Stats {
    fn join(&self, mut sum: Self) -> Self {
        if self.max_dist > sum.max_dist {
            sum.max_dist = self.max_dist;
            sum.max_end = self.max_end;
            sum.max_start = self.max_start;
        }
        if self.radius < sum.radius {
            sum.radius = self.radius;
            sum.center = self.center;
        }
        sum
    }
}

/// Analyzes a cube and determines its diamater, antipodes, center, maybe more.
// TODO(jmerm): technically this returns the wrong answer for graphs with 1 state like 0xB5ADB5AD.
// TODO(jmerm): refactor this to make it more testable?
fn analyze(cube: i64, metric: &Metric) {
    // Do an initial exploration to find all reachable configurations.
    let graph = breadth_first_search(cube, &HTM);

    // Dedupe out configurations that are orientations of one another.
    let mut canonical = HashMap::new();
    for key in graph.keys() {
        canonical.insert(normalize_orientation(*key), key);
    }

    // Search those deduped states to see which has the max eccentricity
    // TODO(jmerm): handle case of many keys with max value.
    let identity_stats = || Stats {
        max_dist: 0,
        max_start: 0,
        max_end: 0,
        radius: 1000,
        center: 0,
    };
    let final_stats: Stats = canonical
        .values()
        .collect::<Vec<&&i64>>()
        .into_par_iter()
        .map(|val| {
            let dist_map = breadth_first_search(**val, metric);
            let (dest, length) = dist_map.iter().max_by_key(|entry| entry.1).unwrap();

            Stats {
                max_dist: *length,
                max_start: **val,
                max_end: *dest,
                radius: *length,
                center: **val,
            }
        })
        .reduce(identity_stats, |sum, i| i.join(sum));

    println!(
        "0x{:x} :: 0x{:x} to 0x{:x} in {}. center 0x{:x} with radius {}",
        cube,
        final_stats.max_start,
        final_stats.max_end,
        final_stats.max_dist,
        final_stats.center,
        final_stats.radius,
    );
}

fn main() {
    // analyze(0x3DE00000C00, &QTM);
    for cube in [
        0x8401_8C20_0860,
        0x10_8400_8020_07BD,
        0x2_3000_8080_002D,
        0x10_0580_842D_8421,
        0x1_0801_88C0_9C46,
    ] {
        analyze(cube, &HTM);
    }
}
