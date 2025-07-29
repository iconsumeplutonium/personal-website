import { z, defineCollection } from "astro:content";
import { glob } from 'astro/loaders';

const projectsCollection = defineCollection({
	loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: "./src/content/projects" }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		image: z.object({
			url: z.string(),
			alt: z.string()
		}),
		stack: z.string(),
		links: z.array(z.object({
            name: z.string(),
            url: z.string()
        })).optional(),
		order: z.number(),
		year: z.number(),
	})
});

const postsCollection = defineCollection({
	loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: "./src/content/posts" }),
	schema: z.object({
		title: z.string(),
		author: z.string(),
		date: z.string(),
		image: z.object({
			url: z.string(),
			alt: z.string()
		})
	})
});

export const collections = {
	projects: projectsCollection,
	posts: postsCollection
};

