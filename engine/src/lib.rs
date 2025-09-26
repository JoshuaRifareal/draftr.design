use wasm_bindgen::prelude::*;
use js_sys::Float32Array;
use wasm_bindgen::JsCast;
use web_sys::{
    HtmlCanvasElement, WebGl2RenderingContext as GL, WebGlProgram, WebGlShader,
    WebGlBuffer, WebGlUniformLocation,
};

static CANVAS_COLOR: [f32; 4] = [0.0, 0.0, 0.0, 0.02]; // White - RGBA

pub struct LineStyle {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
    pub dashed: bool,
    pub dash_length: f32,
    pub gap_length: f32
}

#[wasm_bindgen]
pub struct Renderer {
    gl: GL,
    program: WebGlProgram,
    pos_buffer: WebGlBuffer,
    color_buffer: WebGlBuffer,
    draw_call_count: u32,
    // world transform
    pub offset_x: f32,
    pub offset_y: f32,
    pub scale: f32,

    // orthogonal guide runtime config
    ortho_color: [f32; 4],
    ortho_dash_px: f32,
    ortho_gap_px: f32,
    ortho_thickness_px: f32,
    ortho_threshold_deg: f32,
    ortho_angles_deg: Vec<f32>,

    // grid runtime config
    grid_color: [f32; 4],
    grid_min_spacing: f32,
    grid_max_spacing: f32,

    // canvas runtime config
    canvas_color: [f32; 4],
    selection_color: [f32; 4]
}

#[wasm_bindgen]
impl Renderer {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement) -> Renderer {
        let gl: GL = canvas
            .get_context("webgl2").unwrap().unwrap()
            .dyn_into().unwrap();

        // NOTE: color is vec4 now (r,g,b,a)
        let vs_source = r#"#version 300 es
        in vec2 a_position;
        in vec4 a_color;
        out vec4 v_color;
        uniform vec2 u_resolution;
        uniform vec2 u_offset;
        uniform float u_scale;
        void main() {
            // a_position is in world-space
            vec2 world_pos = (a_position + u_offset) * u_scale;
            vec2 zeroToOne = world_pos / u_resolution;
            vec2 zeroToTwo = zeroToOne * 2.0;
            vec2 clipSpace = zeroToTwo - 1.0;
            gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
            v_color = a_color;
        }"#;

        let fs_source = r#"#version 300 es
        precision mediump float;
        in vec4 v_color;
        out vec4 outColor;
        void main() {
            outColor = v_color;
        }"#;

        let vert_shader = compile_shader(&gl, GL::VERTEX_SHADER, vs_source).unwrap();
        let frag_shader = compile_shader(&gl, GL::FRAGMENT_SHADER, fs_source).unwrap();
        let program = link_program(&gl, &vert_shader, &frag_shader).unwrap();

        let pos_buffer = gl.create_buffer().unwrap();
        let color_buffer = gl.create_buffer().unwrap();

        gl.viewport(0, 0, canvas.width() as i32, canvas.height() as i32);
        gl.clear_color(CANVAS_COLOR[0], CANVAS_COLOR[1], CANVAS_COLOR[2], CANVAS_COLOR[3]);
        gl.clear(GL::COLOR_BUFFER_BIT);

        // Enable blending
        gl.enable(GL::BLEND);
        gl.blend_func(GL::SRC_ALPHA, GL::ONE_MINUS_SRC_ALPHA);

        Renderer {
            gl,
            program,
            pos_buffer,
            color_buffer,
            draw_call_count: 0,
            offset_x: 0.0,
            offset_y: 0.0,
            scale: 1.0,

            // orthogonal defaults
            ortho_color: [0.0, 0.0, 0.0, 0.5],
            ortho_dash_px: 8.0,
            ortho_gap_px: 6.0,
            ortho_thickness_px: 1.0,
            ortho_threshold_deg: 1.0,
            ortho_angles_deg: vec![0.0, 45.0, 90.0, 135.0],

            // grid defaults
            grid_color: [1.0, 1.0, 1.0, 0.3], // Default light gray
            grid_min_spacing: 10.0,
            grid_max_spacing: 50.0,

            // canvas defaults
            canvas_color: [0.0, 0.0, 0.0, 0.02],
            selection_color: [0.0, 0.0, 1.0, 0.4]
        }
    }

    // Ortho guide runtime configuration (call from JS)
    #[wasm_bindgen(js_name = setOrthoColor)]
    pub fn set_ortho_color(&mut self, r: f32, g: f32, b: f32, a: f32) {
        self.ortho_color = [r, g, b, a];
    }
    #[wasm_bindgen(js_name = setOrthoDash)]
    pub fn set_ortho_dash(&mut self, dash_px: f32, gap_px: f32) {
        self.ortho_dash_px = dash_px.max(1.0);
        self.ortho_gap_px = gap_px.max(0.0);
    }
    #[wasm_bindgen(js_name = setOrthoThickness)]
    pub fn set_ortho_thickness(&mut self, thickness_px: f32) {
        self.ortho_thickness_px = thickness_px.max(0.0);
    }
    #[wasm_bindgen(js_name = setOrthoThresholdDeg)]
    pub fn set_ortho_threshold_deg(&mut self, deg: f32) {
        self.ortho_threshold_deg = deg.abs();
    }

    // Grid runtime configuration (call from JS)
    #[wasm_bindgen(js_name = setGridColor)]
    pub fn set_grid_color(&mut self, r: f32, g: f32, b: f32, a: f32) {
        self.grid_color = [r, g, b, a];
    }
    #[wasm_bindgen(js_name = setGridSpacing)]
    pub fn set_grid_spacing(&mut self, min_px: f32, max_px: f32) {
        self.grid_min_spacing = min_px;
        self.grid_max_spacing = max_px;
    }

    // Canvas runtime configuration (call from JS)
    #[wasm_bindgen(js_name = setCanvasColor)]
    pub fn set_canvas_color(&mut self, r: f32, g: f32, b: f32, a: f32) {
        self.canvas_color = [r, g, b, a];
    }

    // Selection color configuration  
    #[wasm_bindgen(js_name = setSelectionColor)]
    pub fn set_selection_color(&mut self, r: f32, g: f32, b: f32, a: f32) {
        self.selection_color = [r, g, b, a];
    }


    /// Add or replace allowed orthogonal angles (in degrees).
    #[wasm_bindgen(js_name = setOrthoAngles)]
    pub fn set_ortho_angles(&mut self, arr: &Float32Array) {
        let mut v: Vec<f32> = Vec::with_capacity(arr.length() as usize);
        for i in 0..arr.length() {
            v.push(arr.get_index(i));
        }
        self.ortho_angles_deg = v;
    }

    /// Resize viewport (call when canvas size changes)
    pub fn resize(&self, width: u32, height: u32) {
        self.gl.viewport(0, 0, width as i32, height as i32);
    }

    /// Draw a line
    #[wasm_bindgen]
    pub fn draw_line(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, r: f32, g: f32, b: f32, a: f32) {
        let points = [
            x1, y1, r, g, b, a,
            x2, y2, r, g, b, a,
        ];
        let _ = self.draw_lines_return(points.as_slice());
    }

    /// Draw a circle (doubles as snap indicator)
    #[wasm_bindgen]
    pub fn draw_circle(&mut self, cx: f32, cy: f32, radius: f32, r: f32, g: f32, b: f32, a: f32, segments: u32, screen_space: bool) {
        let mut points: Vec<f32> = Vec::with_capacity(((segments + 2) * 6) as usize);

        // center vertex
        points.push(cx);
        points.push(cy);
            points.push(r);
            points.push(g);
            points.push(b);
            points.push(a);

        // compute actual radius in world units
        let radius_world = if screen_space {
            radius / self.scale
        } else {
            radius
        };

        for i in 0..=segments {
            let theta = i as f32 / segments as f32 * std::f32::consts::TAU;
            let x = cx + radius_world * theta.cos();
            let y = cy + radius_world * theta.sin();
            points.push(x);
            points.push(y);
            points.push(r);
            points.push(g);
            points.push(b);
            points.push(a);
        }

        self.draw_call_count += 1;
        self.gl.use_program(Some(&self.program));

        let mut positions = Vec::with_capacity(points.len() / 6 * 2);
        let mut colors = Vec::with_capacity(points.len() / 6 * 4);

        for chunk in points.chunks(6) {
            positions.push(chunk[0]);
            positions.push(chunk[1]);
            colors.push(chunk[2]);
            colors.push(chunk[3]);
            colors.push(chunk[4]);
            colors.push(chunk[5]);
        }

        self.gl.bind_buffer(GL::ARRAY_BUFFER, Some(&self.pos_buffer));
        unsafe {
            let f32_pos = Float32Array::view(positions.as_slice());
            self.gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &f32_pos, GL::STATIC_DRAW);
        }
        let a_pos = self.gl.get_attrib_location(&self.program, "a_position") as u32;
        self.gl.enable_vertex_attrib_array(a_pos);
        self.gl.vertex_attrib_pointer_with_i32(a_pos, 2, GL::FLOAT, false, 0, 0);

        self.gl.bind_buffer(GL::ARRAY_BUFFER, Some(&self.color_buffer));
        unsafe {
            let f32_colors = Float32Array::view(colors.as_slice());
            self.gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &f32_colors, GL::STATIC_DRAW);
        }
        let a_color = self.gl.get_attrib_location(&self.program, "a_color") as u32;
        self.gl.enable_vertex_attrib_array(a_color);
        // color is vec4 now
        self.gl.vertex_attrib_pointer_with_i32(a_color, 4, GL::FLOAT, false, 0, 0);

        let u_res: WebGlUniformLocation = self.gl
            .get_uniform_location(&self.program, "u_resolution")
            .unwrap();
        self.gl.uniform2f(
            Some(&u_res),
            self.gl.drawing_buffer_width() as f32,
            self.gl.drawing_buffer_height() as f32,
        );

        let u_offset = self.gl.get_uniform_location(&self.program, "u_offset").unwrap();
        self.gl.uniform2f(Some(&u_offset), self.offset_x, self.offset_y);

        let u_scale = self.gl.get_uniform_location(&self.program, "u_scale").unwrap();
        self.gl.uniform1f(Some(&u_scale), self.scale);

        self.gl.draw_arrays(GL::TRIANGLE_FAN, 0, (positions.len() / 2) as i32);
    }

    /// Draw a rectangle
    #[wasm_bindgen]
    pub fn draw_rectangle(&mut self, x1: f32, y1: f32, x2: f32, y2: f32,
        r: f32, g: f32, b: f32, a: f32, filled: bool) {
        if filled {
            // Filled rectangle (two triangles)
            let points = [
                // First triangle
                x1, y1, r, g, b, a,
                x2, y1, r, g, b, a,
                x2, y2, r, g, b, a,
                // Second triangle
                x1, y1, r, g, b, a,
                x2, y2, r, g, b, a,
                x1, y2, r, g, b, a,
            ];

            self.draw_call_count += 1;
            self.gl.use_program(Some(&self.program));

            let mut positions = Vec::with_capacity(points.len() / 6 * 2);
            let mut colors = Vec::with_capacity(points.len() / 6 * 4);

            for chunk in points.chunks(6) {
                positions.push(chunk[0]);
                positions.push(chunk[1]);
                colors.push(chunk[2]);
                colors.push(chunk[3]);
                colors.push(chunk[4]);
                colors.push(chunk[5]);
            }

            self.gl.bind_buffer(GL::ARRAY_BUFFER, Some(&self.pos_buffer));
            unsafe {
                let f32_pos = Float32Array::view(positions.as_slice());
                self.gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &f32_pos, GL::STATIC_DRAW);
            }
            let a_pos = self.gl.get_attrib_location(&self.program, "a_position") as u32;
            self.gl.enable_vertex_attrib_array(a_pos);
            self.gl.vertex_attrib_pointer_with_i32(a_pos, 2, GL::FLOAT, false, 0, 0);

            self.gl.bind_buffer(GL::ARRAY_BUFFER, Some(&self.color_buffer));
            unsafe {
                let f32_colors = Float32Array::view(colors.as_slice());
                self.gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &f32_colors, GL::STATIC_DRAW);
            }
            let a_color = self.gl.get_attrib_location(&self.program, "a_color") as u32;
            self.gl.enable_vertex_attrib_array(a_color);
            self.gl.vertex_attrib_pointer_with_i32(a_color, 4, GL::FLOAT, false, 0, 0);

            let u_res: WebGlUniformLocation = self.gl
                .get_uniform_location(&self.program, "u_resolution")
                .unwrap();
            self.gl.uniform2f(
                Some(&u_res),
                self.gl.drawing_buffer_width() as f32,
                self.gl.drawing_buffer_height() as f32,
            );

            let u_offset = self.gl.get_uniform_location(&self.program, "u_offset").unwrap();
            self.gl.uniform2f(Some(&u_offset), self.offset_x, self.offset_y);

            let u_scale = self.gl.get_uniform_location(&self.program, "u_scale").unwrap();
            self.gl.uniform1f(Some(&u_scale), self.scale);

            // ✅ Draw as triangles
            self.gl.draw_arrays(GL::TRIANGLES, 0, (positions.len() / 2) as i32);
        } else {
            // Outline rectangle
            let points = [
                x1, y1, r, g, b, a,
                x2, y1, r, g, b, a,
                x2, y2, r, g, b, a,
                x1, y2, r, g, b, a,
                x1, y1, r, g, b, a, // Close loop
            ];

            self.draw_call_count += 1;
            self.gl.use_program(Some(&self.program));

            let mut positions = Vec::with_capacity(points.len() / 6 * 2);
            let mut colors = Vec::with_capacity(points.len() / 6 * 4);

            for chunk in points.chunks(6) {
                positions.push(chunk[0]);
                positions.push(chunk[1]);
                colors.push(chunk[2]);
                colors.push(chunk[3]);
                colors.push(chunk[4]);
                colors.push(chunk[5]);
            }

            self.gl.bind_buffer(GL::ARRAY_BUFFER, Some(&self.pos_buffer));
            unsafe {
                let f32_pos = Float32Array::view(positions.as_slice());
                self.gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &f32_pos, GL::STATIC_DRAW);
            }
            let a_pos = self.gl.get_attrib_location(&self.program, "a_position") as u32;
            self.gl.enable_vertex_attrib_array(a_pos);
            self.gl.vertex_attrib_pointer_with_i32(a_pos, 2, GL::FLOAT, false, 0, 0);

            self.gl.bind_buffer(GL::ARRAY_BUFFER, Some(&self.color_buffer));
            unsafe {
                let f32_colors = Float32Array::view(colors.as_slice());
                self.gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &f32_colors, GL::STATIC_DRAW);
            }
            let a_color = self.gl.get_attrib_location(&self.program, "a_color") as u32;
            self.gl.enable_vertex_attrib_array(a_color);
            self.gl.vertex_attrib_pointer_with_i32(a_color, 4, GL::FLOAT, false, 0, 0);

            let u_res: WebGlUniformLocation = self.gl
                .get_uniform_location(&self.program, "u_resolution")
                .unwrap();
            self.gl.uniform2f(
                Some(&u_res),
                self.gl.drawing_buffer_width() as f32,
                self.gl.drawing_buffer_height() as f32,
            );

            let u_offset = self.gl.get_uniform_location(&self.program, "u_offset").unwrap();
            self.gl.uniform2f(Some(&u_offset), self.offset_x, self.offset_y);

            let u_scale = self.gl.get_uniform_location(&self.program, "u_scale").unwrap();
            self.gl.uniform1f(Some(&u_scale), self.scale);

            // ✅ Draw as line loop
            self.gl.draw_arrays(GL::LINE_LOOP, 0, (positions.len() / 2) as i32);
        }
    }

    /// Draw a selection rectangle
    #[wasm_bindgen]
    pub fn draw_selection_rectangle(&mut self, x1: f32, y1: f32, x2: f32, y2: f32) {
        self.draw_rectangle(x1, y1, x2, y2, 
            self.selection_color[0], self.selection_color[1], 
            self.selection_color[2], self.selection_color[3], 
            true
        );
    }

    /// Draw a cross indicator
    #[wasm_bindgen]
    pub fn draw_cross(&mut self, cx: f32, cy: f32, size_px: f32, r: f32, g: f32, b: f32, a: f32) {
        // Convert screen size to world units
        let size_world = size_px / self.scale;
        let half_size = size_world / 2.0;
        
        // Create horizontal line
        let x1 = cx - half_size;
        let x2 = cx + half_size;
        
        // Create vertical line  
        let y1 = cy - half_size;
        let y2 = cy + half_size;
        
        // Draw horizontal line
        self.draw_line(x1, cy, x2, cy, r, g, b, a);
        
        // Draw vertical line
        self.draw_line(cx, y1, cx, y2, r, g, b, a);
    }

    /// Draw a constraint guide (horizontal or vertical dashed line)
    #[wasm_bindgen]
    pub fn draw_constraint_guide(&mut self, cx: f32, cy: f32, is_horizontal: bool, r: f32, g: f32, b: f32, a: f32) {
        let width = self.gl.drawing_buffer_width() as f32;
        let height = self.gl.drawing_buffer_height() as f32;
        
        // Convert screen dash/gap to world units
        let dash_world = (self.ortho_dash_px / self.scale).max(1e-6);
        let gap_world = (self.ortho_gap_px / self.scale).max(0.0);
        let step = dash_world + gap_world;
        
        // Calculate large enough length to cover the entire viewport
        let viewport_width = width / self.scale;
        let viewport_height = height / self.scale;
        let diag = viewport_width.max(viewport_height) * 2.0;
        
        let mut seg_points: Vec<f32> = Vec::new();
        
        if is_horizontal {
            // Horizontal constraint line at y = cy
            let mut x = cx - diag;
            while x < cx + diag {
                let x0 = x;
                let x1 = (x + dash_world).min(cx + diag);
                
                seg_points.push(x0);
                seg_points.push(cy);
                seg_points.push(r);
                seg_points.push(g);
                seg_points.push(b);
                seg_points.push(a);
                
                seg_points.push(x1);
                seg_points.push(cy);
                seg_points.push(r);
                seg_points.push(g);
                seg_points.push(b);
                seg_points.push(a);
                
                x += step;
            }
        } else {
            // Vertical constraint line at x = cx
            let mut y = cy - diag;
            while y < cy + diag {
                let y0 = y;
                let y1 = (y + dash_world).min(cy + diag);
                
                seg_points.push(cx);
                seg_points.push(y0);
                seg_points.push(r);
                seg_points.push(g);
                seg_points.push(b);
                seg_points.push(a);
                
                seg_points.push(cx);
                seg_points.push(y1);
                seg_points.push(r);
                seg_points.push(g);
                seg_points.push(b);
                seg_points.push(a);
                
                y += step;
            }
        }
        
        // Set line thickness
        self.gl.line_width(self.ortho_thickness_px);
        
        // Draw the constraint guide
        if !seg_points.is_empty() {
            let _ = self.draw_lines(seg_points.as_slice());
        }
    }

    /// points_with_color is now [x,y,r,g,b,a, x,y,r,g,b,a, ...]
    /// Returns a Float32Array copy of input (compat with previous API)
    pub fn draw_lines(&mut self, points_with_color: &[f32]) -> Float32Array {
        self.draw_call_count += 1;
        self.gl.use_program(Some(&self.program));

        let mut positions = Vec::with_capacity(points_with_color.len() / 6 * 2);
        let mut colors = Vec::with_capacity(points_with_color.len() / 6 * 4);

        for chunk in points_with_color.chunks(6) {
            positions.push(chunk[0]);
            positions.push(chunk[1]);
            colors.push(chunk[2]);
            colors.push(chunk[3]);
            colors.push(chunk[4]);
            colors.push(chunk[5]);
        }

        self.gl.bind_buffer(GL::ARRAY_BUFFER, Some(&self.pos_buffer));
        unsafe {
            let f32_pos = Float32Array::view(positions.as_slice());
            self.gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &f32_pos, GL::STATIC_DRAW);
        }
        let a_pos = self.gl.get_attrib_location(&self.program, "a_position") as u32;
        self.gl.enable_vertex_attrib_array(a_pos);
        self.gl.vertex_attrib_pointer_with_i32(a_pos, 2, GL::FLOAT, false, 0, 0);

        self.gl.bind_buffer(GL::ARRAY_BUFFER, Some(&self.color_buffer));
        unsafe {
            let f32_colors = Float32Array::view(colors.as_slice());
            self.gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &f32_colors, GL::STATIC_DRAW);
        }
        let a_color = self.gl.get_attrib_location(&self.program, "a_color") as u32;
        self.gl.enable_vertex_attrib_array(a_color);
        // color is vec4 now
        self.gl.vertex_attrib_pointer_with_i32(a_color, 4, GL::FLOAT, false, 0, 0);

        let u_res: WebGlUniformLocation = self.gl
            .get_uniform_location(&self.program, "u_resolution")
            .unwrap();
        self.gl.uniform2f(
            Some(&u_res),
            self.gl.drawing_buffer_width() as f32,
            self.gl.drawing_buffer_height() as f32,
        );

        let u_offset = self.gl.get_uniform_location(&self.program, "u_offset").unwrap();
        self.gl.uniform2f(Some(&u_offset), self.offset_x, self.offset_y);

        let u_scale = self.gl.get_uniform_location(&self.program, "u_scale").unwrap();
        self.gl.uniform1f(Some(&u_scale), self.scale);

        self.gl.draw_arrays(GL::LINES, 0, (positions.len() / 2) as i32);

        Float32Array::from(points_with_color)
    }

    // internal helper that mirrors draw_lines but does not produce return value
    fn draw_lines_return(&mut self, points_with_color: &[f32]) -> Float32Array {
        self.draw_lines(points_with_color)
    }

    pub fn clear(&self) {
        self.gl.clear_color(
            self.canvas_color[0], 
            self.canvas_color[1], 
            self.canvas_color[2], 
            self.canvas_color[3]
        );
        self.gl.clear(GL::COLOR_BUFFER_BIT);
    }

    /// Draw an adaptive grid
    pub fn draw_grid(&mut self, offset_x: f32, offset_y: f32, scale: f32) {
        // Save current transform, restore later
        let prev_off_x = self.offset_x;
        let prev_off_y = self.offset_y;
        let prev_scale = self.scale;

        self.offset_x = offset_x;
        self.offset_y = offset_y;
        self.scale = scale;

        let width = self.gl.drawing_buffer_width() as f32;
        let height = self.gl.drawing_buffer_height() as f32;

        // world extents visible
        let min_x = 0.0 / scale - offset_x;
        let max_x = width / scale - offset_x;
        let min_y = 0.0 / scale - offset_y;
        let max_y = height / scale - offset_y;

        // Choose a "nice" world spacing such that spacing_in_pixels in [30, 100]
        let min_px = self.grid_min_spacing;
        let max_px = self.grid_max_spacing;
        let mut chosen_spacing_world = 1.0_f32;
        let base_steps = [1.0_f32, 2.0_f32, 5.0_f32];

        // search exponents from -8 to +8 (covers a wide range)
        'outer: for exp in -8..=8 {
            let pow10 = 10f32.powi(exp);
            for base in base_steps.iter() {
                let candidate = base * pow10;
                let screen_spacing = candidate * scale;
                if screen_spacing >= min_px && screen_spacing <= max_px {
                    chosen_spacing_world = candidate;
                    break 'outer;
                }
            }
        }

        // Fallback: if none found, pick spacing that makes ~50px
        if chosen_spacing_world == 1.0 {
            chosen_spacing_world = 50.0 / scale;
        }

        // We'll batch minor and major lines separately so we can set different line widths
        let mut minor_points: Vec<f32> = Vec::new(); // x,y,r,g,b,a, x2...
        let mut major_points: Vec<f32> = Vec::new();

        let major_color: [f32; 4] = self.grid_color;
        let minor_color: [f32; 4] = [self.grid_color[0], self.grid_color[1], self.grid_color[2], (self.grid_color[3] * 0.7)]; // lighter, same alpha

        // vertical lines
        let start_i = (min_x / chosen_spacing_world).floor() as i32;
        let end_i = (max_x / chosen_spacing_world).ceil() as i32;
        for i in start_i..=end_i {
            let x = i as f32 * chosen_spacing_world;
            // determine major vs minor (major every 10)
            if i % 10 == 0 {
                // major line (darker)
                major_points.push(x);
                major_points.push(min_y);
                major_points.push(major_color[0]);
                major_points.push(major_color[1]);
                major_points.push(major_color[2]);
                major_points.push(major_color[3]);

                major_points.push(x);
                major_points.push(max_y);
                major_points.push(major_color[0]);
                major_points.push(major_color[1]);
                major_points.push(major_color[2]);
                major_points.push(major_color[3]);
            } else {
                // minor line (lighter)
                minor_points.push(x);
                minor_points.push(min_y);
                minor_points.push(minor_color[0]);
                minor_points.push(minor_color[1]);
                minor_points.push(minor_color[2]);
                minor_points.push(minor_color[3]);

                minor_points.push(x);
                minor_points.push(max_y);
                minor_points.push(minor_color[0]);
                minor_points.push(minor_color[1]);
                minor_points.push(minor_color[2]);
                minor_points.push(minor_color[3]);
            }
        }

        // horizontal lines
        let start_j = (min_y / chosen_spacing_world).floor() as i32;
        let end_j = (max_y / chosen_spacing_world).ceil() as i32;
        for j in start_j..=end_j {
            let y = j as f32 * chosen_spacing_world;
            if j % 10 == 0 {
                major_points.push(min_x);
                major_points.push(y);
                major_points.push(major_color[0]);
                major_points.push(major_color[1]);
                major_points.push(major_color[2]);
                major_points.push(major_color[3]);

                major_points.push(max_x);
                major_points.push(y);
                major_points.push(major_color[0]);
                major_points.push(major_color[1]);
                major_points.push(major_color[2]);
                major_points.push(major_color[3]);
            } else {
                minor_points.push(min_x);
                minor_points.push(y);
                minor_points.push(minor_color[0]);
                minor_points.push(minor_color[1]);
                minor_points.push(minor_color[2]);
                minor_points.push(minor_color[3]);

                minor_points.push(max_x);
                minor_points.push(y);
                minor_points.push(minor_color[0]);
                minor_points.push(minor_color[1]);
                minor_points.push(minor_color[2]);
                minor_points.push(minor_color[3]);
            }
        }

        // Draw minor lines with thin width
        self.gl.line_width(1.0);
        if !minor_points.is_empty() {
            let _ = self.draw_lines(minor_points.as_slice());
        }

        // Draw major lines with thicker width
        self.gl.line_width(2.0);
        if !major_points.is_empty() {
            let _ = self.draw_lines(major_points.as_slice());
        }

        // restore transform
        self.offset_x = prev_off_x;
        self.offset_y = prev_off_y;
        self.scale = prev_scale;
    }

    /// Draw an orthogonal guide as dashed line across the canvas.
    /// - cx,cy: world coordinates where the guide should intersect (usually cursor or preview point)
    /// - angle_rad: direction of the line in radians (0 = horizontal to the right)
    /// Dash and gap lengths are specified in screen pixels (converted to world units using current scale).
    #[wasm_bindgen(js_name = drawOrthoGuide)]
    pub fn draw_ortho_guide(&mut self, cx: f32, cy: f32, angle_rad: f32) {
        // compute a large length in world units to cover entire canvas regardless of pan/zoom
        let width = self.gl.drawing_buffer_width() as f32;
        let height = self.gl.drawing_buffer_height() as f32;

        // Extend length enough to fully cover diagonal of viewport, multiplied for safety
        let diag = (width.max(height) * 2.0) / self.scale;

        let dx = angle_rad.cos();
        let dy = angle_rad.sin();

        // endpoints in world coords
        let _x1 = cx - dx * diag;
        let _y1 = cy - dy * diag;
        let _x2 = cx + dx * diag;
        let _y2 = cy + dy * diag;

        // dash/gap in world units
        let dash_world = (self.ortho_dash_px / self.scale).max(1e-6);
        let gap_world = (self.ortho_gap_px / self.scale).max(0.0);
        let step = dash_world + gap_world;

        // total length along the line (world units)
        let _total_len = 2.0 * diag;
        // start parameter from -diag to +diag
        let mut t = -diag;

        let mut seg_points: Vec<f32> = Vec::new();
        let color = self.ortho_color;

        while t < diag {
            // dash segment from t to t + dash_world (clamped by diag)
            let t0 = t.max(-diag);
            let t1 = (t + dash_world).min(diag);

            // calculate world coords for t0 and t1
            let sx = cx + dx * t0;
            let sy = cy + dy * t0;
            let ex = cx + dx * t1;
            let ey = cy + dy * t1;

            // push segment as two vertices with color
            seg_points.push(sx);
            seg_points.push(sy);
            seg_points.push(color[0]);
            seg_points.push(color[1]);
            seg_points.push(color[2]);
            seg_points.push(color[3]);

            seg_points.push(ex);
            seg_points.push(ey);
            seg_points.push(color[0]);
            seg_points.push(color[1]);
            seg_points.push(color[2]);
            seg_points.push(color[3]);

            t += step;
        }

        // attempt to set line width according to ortho_thickness_px (converted to GL line width)
        // Note: many browsers ignore line_width for WebGL; left here for completeness.
        self.gl.line_width(self.ortho_thickness_px);

        if !seg_points.is_empty() {
            let _ = self.draw_lines(seg_points.as_slice());
        }
    }
}

// === Shader helpers ===
fn compile_shader(gl: &GL, shader_type: u32, source: &str) -> Result<WebGlShader, String> {
    let shader = gl.create_shader(shader_type).ok_or("Unable to create shader")?;
    gl.shader_source(&shader, source);
    gl.compile_shader(&shader);

    if gl.get_shader_parameter(&shader, GL::COMPILE_STATUS).as_bool().unwrap_or(false) {
        Ok(shader)
    } else {
        Err(gl.get_shader_info_log(&shader).unwrap_or_else(|| "Unknown compile error".into()))
    }
}

fn link_program(gl: &GL, vert: &WebGlShader, frag: &WebGlShader) -> Result<WebGlProgram, String> {
    let program = gl.create_program().ok_or("Unable to create program")?;
    gl.attach_shader(&program, vert);
    gl.attach_shader(&program, frag);
    gl.link_program(&program);

    if gl.get_program_parameter(&program, GL::LINK_STATUS).as_bool().unwrap_or(false) {
        Ok(program)
    } else {
        Err(gl.get_program_info_log(&program).unwrap_or_else(|| "Unknown link error".into()))
    }
}