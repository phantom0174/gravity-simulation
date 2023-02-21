// const { CNCONFIG } = require('./config');
import { Point } from './objs';


export class Simulator {
    constructor(ctx, grid, pointer) {
        this.ctx = ctx;
        this.ctx.fillStyle = `rgb(${CNCONFIG.point_color})`;

        this.grid = grid;
        this.pointer = pointer;

        // initialize points
        for (let i = 0; i < CNCONFIG.point_count; i++) {
            this.grid.insertPoint(new Point(this.grid.w, this.grid.h));
        }

        // index: 10 * opacity(0.2 ~ 1) - 2
        // inverse: (index + 2) / 10
        this.draw_buffer = new Array(9).fill(null).map(() => []);
        this.d_info; // draw info variable buffer
    }

    async traverse() {
        for (let ci = 0; ; ci++) {
            let tasks = [];

            if (ci >= 0 && ci < CNCONFIG.X_CHUNK) tasks.push(this.calVerticalInteraction(ci));
            if (ci - 2 >= 0 && ci - 2 < CNCONFIG.X_CHUNK) tasks.push(this.evolveVerticalChunks(ci - 2));
            if (ci - 4 >= 0 && ci - 4 < CNCONFIG.X_CHUNK) tasks.push(this.updateVerticalChunks(ci - 4));
            if (tasks.length === 0) {
                if (Math.random() < 0.1) console.log(CNCONFIG.ops);
                CNCONFIG.ops = 0;
                break;
            }

            await Promise.all(tasks);
        }
    }

    loadInfoIntoDrawBuffer() {
        if (!this.d_info) return;
        this.draw_buffer[10 * this.d_info.a - 2].push(this.d_info.pos_info);
    }

    drawLinesInBuffer() {
        // 0.2 ~ 1
        // let sum = 0;
        for (let i = 0; i < 9; i++) {
            const info = this.draw_buffer[i];
            // sum += info.length;

            this.ctx.beginPath();

            const alpha = (i + 2) / 10;
            this.ctx.lineWidth = alpha;
            this.ctx.strokeStyle = `rgba(${CNCONFIG.line_color},${alpha})`;
            info.forEach(pos_info => {
                this.ctx.moveTo(pos_info[0], pos_info[1]);
                this.ctx.lineTo(pos_info[2], pos_info[3]);
            });
            this.ctx.stroke();

            this.draw_buffer[i] = [];
        }
        // if (Math.random() < 0.1) console.log(sum);
    }

    async calVerticalInteraction(ci) {
        const grid = this.grid;

        for (let cj = 0; cj < CNCONFIG.Y_CHUNK; cj++) {
            const chunk = grid.chunks[ci][cj];

            // temp var
            const right_x = chunk.x + chunk.w;
            const right_y = chunk.y + chunk.h;

            this.calLocalInteraction(chunk);

            // calculate interaction in surrounding chunk
            chunk.points.forEach(tar_p => {
                if (this.pointer.x !== null) {
                    this.d_info = tar_p.calInterWithPointer(this.pointer);
                    this.loadInfoIntoDrawBuffer();
                }

                // compute chunks within interaction range
                let chunk_left_x = 0, chunk_right_x = 0;
                let chunk_left_y = 0, chunk_right_y = 0;
                if (tar_p.x - CNCONFIG.max_d < chunk.x) chunk_left_x = -1;
                if (tar_p.x + CNCONFIG.max_d >= right_x) chunk_right_x = 1;
                if (tar_p.y - CNCONFIG.max_d < chunk.y) chunk_left_y = -1;
                if (tar_p.y + CNCONFIG.max_d >= right_y) chunk_right_y = 1;

                for (let i = chunk_left_x; i <= chunk_right_x; i++) {
                    for (let j = chunk_left_y; j <= chunk_right_y; j++) {
                        if (i === 0 && j === 0) continue;
                        if (
                            ci + i < 0 || ci + i > CNCONFIG.X_CHUNK - 1
                            || cj + j < 0 || cj + j > CNCONFIG.Y_CHUNK - 1
                        ) continue;

                        this.calSurroundingInteraction(grid.chunks[ci + i][cj + j], tar_p, chunk.divergence);
                    }
                }
            });
        }

        this.drawLinesInBuffer();
    }

    calLocalInteraction(chunk) {
        for (let i = 0; i < chunk.points.length - 1; i++) {
            const p = chunk.points[i];

            for (let j = i + 1; j < chunk.points.length; j++) {
                const tar_p = chunk.points[j];

                this.d_info = p.calInterWithPoint(tar_p, true);
                this.loadInfoIntoDrawBuffer();

                tar_p.calInterWithPoint(p, false);
            }
        }
    }

    calSurroundingInteraction(tar_chunk, local_p, local_div) {
        const need_draw = local_div || tar_chunk.divergence === local_div;
        tar_chunk.points.forEach(tar_p => {
            this.d_info = local_p.calInterWithPoint(tar_p, need_draw);
            this.loadInfoIntoDrawBuffer();
        });
    }

    async evolveVerticalChunks(ci) {
        for (let cj = 0; cj < CNCONFIG.Y_CHUNK; cj++) {
            this.grid.chunks[ci][cj].points.forEach(p => {
                this.ctx.fillRect(p.x - 0.5, p.y - 0.5, 1, 1);
                p.evolve();
            });
        }
    }

    // update what chunk is point currently in after evolving
    async updateVerticalChunks(ci) {
        for (let cj = 0; cj < CNCONFIG.Y_CHUNK; cj++) {
            const chunk = this.grid.chunks[ci][cj];

            // for temp
            const right_x = chunk.x + chunk.w;
            const right_y = chunk.y + chunk.h;

            let rmv_list = [];
            for (let i = 0; i < chunk.points.length; i++) {
                const cur_p = chunk.points[i];

                let chunk_dx = 0, chunk_dy = 0;
                if (cur_p.x < chunk.x) chunk_dx = -1;
                else if (cur_p.x >= right_x) chunk_dx = 1;

                if (cur_p.y < chunk.y) chunk_dy = -1;
                else if (cur_p.y >= right_y) chunk_dy = 1;

                if (chunk_dx === 0 && chunk_dy === 0) continue;

                const new_chunk_x = ci + chunk_dx;
                const new_chunk_y = cj + chunk_dy;

                if (new_chunk_x < 0 || new_chunk_x > CNCONFIG.X_CHUNK - 1) {
                    cur_p.vx *= -1;
                    cur_p.x += cur_p.vx;
                    if (cur_p.x <= 0) cur_p.x = 0.1;
                    else if (cur_p.x > this.grid.w) cur_p.x = this.grid.w - 0.1;
                } else if (new_chunk_y < 0 || new_chunk_y > CNCONFIG.Y_CHUNK - 1) {
                    cur_p.vy *= -1;
                    cur_p.y += cur_p.vy;
                    if (cur_p.y <= 0) cur_p.y = 0.1;
                    else if (cur_p.y > this.grid.h) cur_p.y = this.grid.h - 0.1;
                } else { // move to new chunk, or to random location if full
                    rmv_list.push(i);

                    const new_chunk = this.grid.chunks[new_chunk_x][new_chunk_y];
                    if (new_chunk.points.length < CNCONFIG.chunk_current_capacity) new_chunk.points.push(cur_p);
                    else this.grid.insertPoint(new Point(this.grid.w, this.grid.h));
                }
            }

            let cur_rmv_ind = 0;
            chunk.points = chunk.points.filter((v, ind) => {
                if (cur_rmv_ind !== rmv_list.length && ind === rmv_list[cur_rmv_ind]) {
                    cur_rmv_ind++;
                    return false;
                } else {
                    return true;
                }
            });
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.grid.w, this.grid.h);
        this.traverse();
    }
}
