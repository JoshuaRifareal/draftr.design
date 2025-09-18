use wasm_bindgen::prelude::*;
use js_sys::Float32Array;
use wasm_bindgen::JsCast;
use web_sys::{
    HtmlCanvasElement, WebGl2RenderingContext as GL, WebGlProgram, WebGlShader,
    WebGlBuffer, WebGlUniformLocation,
};

static CLEAR_COLORVAR: [f32; 4] = [1.0, 1.0, 1.0, 1.0]; // White - RGBA
static GRID_COLOR: [f32; 4] = [0.0, 0.0, 0.0, 0.3]; // Light gray - RGBA

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
}

pub struct LineStyle {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
    pub dashed: bool,
    pub dash_length: f32,
    pub gap_length: f32,
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
        gl.clear_color(CLEAR_COLORVAR[0],CLEAR_COLORVAR[1],CLEAR_COLORVAR[2],CLEAR_COLORVAR[3]);
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
        }
    }

    /// Resize viewport (call when canvas size changes)
    pub fn resize(&self, width: u32, height: u32) {
        self.gl.viewport(0, 0, width as i32, height as i32);
    }

    /// Draw a line using world coordinates (alpha added)
    pub fn draw_line(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, r: f32, g: f32, b: f32, a: f32) {
        let points = [
            x1, y1, r, g, b, a,
            x2, y2, r, g, b, a,
        ];
        self.draw_lines(&points);
    }

    /// Draw a circle; radius in screen-space only if `screen_space` is true
    /// alpha param added
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
            // convert screen radius (pixels) to world units using current scale
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

    /// points_with_color is now [x,y,r,g,b,a, x,y,r,g,b,a, ...]
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

    pub fn clear(&self) {
        self.gl.clear_color(CLEAR_COLORVAR[0],CLEAR_COLORVAR[1],CLEAR_COLORVAR[2],CLEAR_COLORVAR[3]);
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
        let min_px = 30.0;
        let max_px = 100.0;
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

        let major_color: [f32; 4] = GRID_COLOR;
        let minor_color: [f32; 4] = [GRID_COLOR[0], GRID_COLOR[1], GRID_COLOR[2], (GRID_COLOR[3] * 0.7)]; // lighter, same alpha

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



