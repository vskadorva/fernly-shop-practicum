# Feature: plant reviews

Customers can read and write reviews on a plant's page.

## How it should behave

- The plant page has a **Reviews** section: the average rating, how many reviews there are, and the reviews, newest first.
- **The average is rounded to one decimal, halves up:** ratings 5, 4 and 5 average 4.666… and show as **4.7**.
- With no reviews, the section says so and invites the first one.
- Signed-in customers see **Write a review**: a 1–5 star rating and a text of 10 to 500 characters. Everyone else sees "Sign in to write a review".
- **The star rating works with the keyboard** like any group of radio buttons: Tab moves into it, the arrow keys change the rating, and a screen reader announces which star is selected.
- After posting, the review **appears in the list right away**, and the page thanks the customer.
- One review per customer per plant.
- **Only the author can delete a review.** Anyone else gets "Review not found".

## API

`GET /api/plants/{plantId}/reviews`, `POST /api/plants/{plantId}/reviews` and `DELETE /api/reviews/{reviewId}`. See Swagger UI.
