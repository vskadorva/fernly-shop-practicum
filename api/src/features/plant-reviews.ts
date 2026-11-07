import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { FeatureContext } from '../app.js';
import { ApiError, notFound } from '../errors.js';
import { error, json, ok, secured } from '../openapi.js';
import { store } from '../store.js';

interface ReviewRecord {
  id: string;
  plantId: string;
  userId: string | null;
  author: string;
  rating: number;
  text: string;
  createdAt: string;
}

const SEED: Omit<ReviewRecord, 'id'>[] = [
  { plantId: 'pl-snake', userId: null, author: 'Grace L.', rating: 5, text: 'Survived my dark hallway and a month of neglect.', createdAt: '2026-09-02T10:00:00.000Z' },
  { plantId: 'pl-snake', userId: null, author: 'Omar K.', rating: 4, text: 'Arrived healthy, a little smaller than expected.', createdAt: '2026-09-18T15:30:00.000Z' },
  { plantId: 'pl-snake', userId: 'usr-ben', author: 'Ben Moss', rating: 5, text: 'My third one. Impossible to kill.', createdAt: '2026-10-05T08:10:00.000Z' },
  { plantId: 'pl-monstera', userId: null, author: 'Priya S.', rating: 5, text: 'Two new leaves in the first month!', createdAt: '2026-08-21T09:00:00.000Z' },
  { plantId: 'pl-monstera', userId: null, author: 'Leo M.', rating: 4, text: 'Beautiful, but it needed a bigger pot quickly.', createdAt: '2026-09-11T12:00:00.000Z' },
  { plantId: 'pl-pothos', userId: null, author: 'Hana T.', rating: 4, text: 'Trails nicely from a shelf.', createdAt: '2026-10-01T17:45:00.000Z' },
];

let reviews: ReviewRecord[] = [];
const seed = () => {
  reviews = SEED.map((review, index) => ({ ...review, id: `rv-seed-${index + 1}` }));
};
seed();

const ReviewSchema = z
  .object({
    id: z.string(),
    author: z.string(),
    rating: z.number().int().min(1).max(5),
    text: z.string(),
    createdAt: z.string(),
  })
  .openapi('Review');

const ReviewListSchema = z
  .object({
    plantId: z.string(),
    average: z.number().openapi({ description: 'Average rating, rounded to one decimal (halves round up). 0 when there are no reviews.' }),
    count: z.number().int(),
    reviews: z.array(ReviewSchema),
  })
  .openapi('ReviewList');

const ReviewCreateSchema = z
  .object({
    rating: z.number().int('rating must be a whole number').min(1, 'rating must be 1 to 5').max(5, 'rating must be 1 to 5'),
    text: z.string().trim().min(10, 'text must have at least 10 characters').max(500, 'text must have 500 characters or less'),
  })
  .openapi('ReviewCreate');

const view = ({ id, author, rating, text, createdAt }: ReviewRecord) => ({ id, author, rating, text, createdAt });

export function register({ router, registry, requireUser, onReset }: FeatureContext): void {
  onReset(seed);

  router.get('/plants/:plantId/reviews', (req, res) => {
    const plant = store.getPlant(req.params.plantId);
    const list = reviews.filter((review) => review.plantId === plant.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const average = list.length ? Math.floor((list.reduce((sum, review) => sum + review.rating, 0) / list.length) * 10) / 10 : 0;
    res.json({ plantId: plant.id, average, count: list.length, reviews: list.map(view) });
  });

  router.post('/plants/:plantId/reviews', (req, res) => {
    const user = requireUser(req);
    const plant = store.getPlant(req.params.plantId);
    const body = ReviewCreateSchema.parse(req.body ?? {});
    if (reviews.some((review) => review.plantId === plant.id && review.userId === user.id)) {
      throw new ApiError(409, 'You already reviewed this plant.', 'already_reviewed');
    }
    const review: ReviewRecord = {
      id: `rv-${randomBytes(4).toString('hex')}`,
      plantId: plant.id,
      userId: user.id,
      author: user.name,
      rating: body.rating,
      text: body.text,
      createdAt: new Date().toISOString(),
    };
    reviews.push(review);
    res.status(201).json(view(review));
  });

  router.delete('/reviews/:reviewId', (req, res) => {
    requireUser(req);
    const index = reviews.findIndex((review) => review.id === req.params.reviewId);
    if (index === -1) throw notFound(`Review ${req.params.reviewId}`);
    reviews.splice(index, 1);
    res.status(204).end();
  });

  const reviewId = z.object({ reviewId: z.string().openapi({ example: 'rv-1a2b3c4d' }) });
  const plantId = z.object({ plantId: z.string().openapi({ example: 'pl-snake' }) });
  registry.registerPath({
    method: 'get',
    path: '/api/plants/{plantId}/reviews',
    tags: ['Reviews'],
    summary: "List a plant's reviews",
    description: 'Newest first. Anyone can read reviews.',
    request: { params: plantId },
    responses: { 200: ok('The reviews and their average.', ReviewListSchema), 404: error('Unknown plant.') },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/plants/{plantId}/reviews',
    tags: ['Reviews'],
    summary: 'Review a plant',
    description: 'One review per customer per plant (rule: already_reviewed). Rating 1–5, text 10–500 characters.',
    security: secured,
    request: { params: plantId, body: json(ReviewCreateSchema) },
    responses: {
      201: ok('The new review.', ReviewSchema),
      400: error('validation_error.'),
      401: error('auth_required.'),
      404: error('Unknown plant.'),
      409: error('already_reviewed.'),
    },
  });
  registry.registerPath({
    method: 'delete',
    path: '/api/reviews/{reviewId}',
    tags: ['Reviews'],
    summary: 'Delete my review',
    description: 'Only the author can delete a review; anyone else gets 404.',
    security: secured,
    request: { params: reviewId },
    responses: { 204: { description: 'Deleted.' }, 401: error('auth_required.'), 404: error('Not one of my reviews.') },
  });
}
