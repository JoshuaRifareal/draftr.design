use wasm_bindgen::prelude::*;
use js_sys::Float32Array;
use wasm_bindgen::JsCast;
use web_sys::{
    HtmlCanvasElement, WebGl2RenderingContext as GL, WebGlProgram, WebGlShader,
    WebGlBuffer, WebGlUniformLocation,
};

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

#[wasm_bindgen]
impl Renderer {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement) -> Renderer {
        let gl: GL = canvas
            .get_context("webgl2").unwrap().unwrap()
            .dyn_into().unwrap();

        let vs_source = r#"#version 300 es
        in vec2 a_position;
        in vec3 a_color;
        out vec3 v_color;
        uniform vec2 u_resolution;
        uniform vec2 u_offset;
        uniform float u_scale;
        void main() {
            vec2 world_pos = (a_position + u_offset) * u_scale;
            vec2 zeroToOne = world_pos / u_resolution;
            vec2 zeroToTwo = zeroToOne * 2.0;
            vec2 clipSpace = zeroToTwo - 1.0;
            gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
            v_color = a_color;
        }"#;

        let fs_source = r#"#version 300 es
        precision mediump float;
        in vec3 v_color;
        out vec4 outColor;
        void main() {
            outColor = vec4(v_color, 1.0);
        }"#;

        let vert_shader = compile_shader(&gl, GL::VERTEX_SHADER, vs_source).unwrap();
        let frag_shader = compile_shader(&gl, GL::FRAGMENT_SHADER, fs_source).unwrap();
        let program = link_program(&gl, &vert_shader, &frag_shader).unwrap();

        let pos_buffer = gl.create_buffer().unwrap();
        let color_buffer = gl.create_buffer().unwrap();

        gl.viewport(0, 0, canvas.width() as i32, canvas.height() as i32);
        gl.clear_color(0.2, 0.2, 0.2, 1.0);
        gl.clear(GL::COLOR_BUFFER_BIT);

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

    /// Draw a line using world coordinates
    pub fn draw_line(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, r: f32, g: f32, b: f32) {
        let points = [
            x1, y1, r, g, b,
            x2, y2, r, g, b,
        ];
        self.draw_lines(&points);
    }

    /// Draw a circle; radius in screen-space only if `screen_space` is true
    pub fn draw_circle(&mut self, cx: f32, cy: f32, radius: f32, r: f32, g: f32, b: f32, segments: u32, screen_space: bool) {
        let mut points: Vec<f32> = Vec::with_capacity(((segments + 2) * 5) as usize);

        // center vertex
        points.push(cx);
        points.push(cy);
        points.push(r);
        points.push(g);
        points.push(b);

        // compute actual radius
        let radius_world = if screen_space {
            radius / self.scale // convert screen radius to world units
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
        }

        self.draw_call_count += 1;
        self.gl.use_program(Some(&self.program));

        let mut positions = Vec::with_capacity(points.len() / 5 * 2);
        let mut colors = Vec::with_capacity(points.len() / 5 * 3);

        for chunk in points.chunks(5) {
            positions.push(chunk[0]);
            positions.push(chunk[1]);
            colors.push(chunk[2]);
            colors.push(chunk[3]);
            colors.push(chunk[4]);
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
        self.gl.vertex_attrib_pointer_with_i32(a_color, 3, GL::FLOAT, false, 0, 0);

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

    pub fn draw_lines(&mut self, points_with_color: &[f32]) -> Float32Array {
        self.draw_call_count += 1;
        self.gl.use_program(Some(&self.program));

        let mut positions = Vec::with_capacity(points_with_color.len() / 5 * 2);
        let mut colors = Vec::with_capacity(points_with_color.len() / 5 * 3);

        for chunk in points_with_color.chunks(5) {
            positions.push(chunk[0]);
            positions.push(chunk[1]);
            colors.push(chunk[2]);
            colors.push(chunk[3]);
            colors.push(chunk[4]);
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
        self.gl.vertex_attrib_pointer_with_i32(a_color, 3, GL::FLOAT, false, 0, 0);

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
        self.gl.clear_color(0.2, 0.2, 0.2, 1.0);
        self.gl.clear(GL::COLOR_BUFFER_BIT);
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
