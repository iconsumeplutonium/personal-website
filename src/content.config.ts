import { z, defineCollection } from "astro:content";
import { glob } from 'astro/loaders';
import type { deselectScripts } from "astro/virtual-modules/transitions-swap-functions.js";

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

const blogCollection = defineCollection({
	loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: "./src/content/blog" }),
	schema: z.object({
		title: z.string(),
		date: z.string(),
		description: z.string(),
	})
});

export const collections = {
	projects: projectsCollection,
	blog: blogCollection
};

