// draftr/engine/src/lib.rs
use wasm_bindgen::prelude::*;
use js_sys::Float32Array;

// Enable better panic messages
#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn draw_line(x1: f32, y1: f32, x2: f32, y2: f32) -> Float32Array {
    // Return a Float32Array to JS containing [x1, y1, x2, y2]
    let points: [f32; 4] = [x1, y1, x2, y2];
    Float32Array::from(points.as_ref())
}
