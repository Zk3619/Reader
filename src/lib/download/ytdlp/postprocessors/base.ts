import type { PostProcessorContext, PostProcessorResult } from '../types';

export interface PostProcessor {
  name: string;
  run(ctx: PostProcessorContext): Promise<PostProcessorResult>;
}

export abstract class PostProcessorBase implements PostProcessor {
  abstract name: string;
  abstract run(ctx: PostProcessorContext): Promise<PostProcessorResult>;
}
