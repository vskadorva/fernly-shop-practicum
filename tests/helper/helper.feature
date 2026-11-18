@helper
Feature: Fernly Helper
  A customer types what they want into Ask Fernly. The helper picks one of the
  shop's tools, fills in its arguments, and the shop does it. The helper may now
  and then read the same message differently, so every row must pick the right
  tool with the right arguments at least 9 times out of 10.

  Background:
    Given I am signed in as the first customer from .env.example
    And my cart is empty

  Scenario Outline: Numbers and sizes are understood as said
    When I ask the helper "<phrase>"
    Then the helper calls add_to_cart with plantId "<plantId>", size "<size>" and quantity <quantity>
    And the cart holds <quantity> of "<plantId>" in size "<size>"
    And the cart count in the header shows <quantity> right away

    Examples:
      | phrase                                   | plantId        | size | quantity |
      | add two Monstera Deliciosa to my cart    | pl-monstera    | S    | 2        |
      | add 2 Snake Plants                       | pl-snake       | S    | 2        |
      | I'd like a pair of Boston Ferns          | pl-boston-fern | S    | 2        |
      | add three medium Rubber Plants           | pl-rubber      | M    | 3        |
      | put 4 Spider Plants in size M in my cart | pl-spider      | M    | 4        |
      | add one large Bird of Paradise           | pl-bird        | L    | 1        |
      | add a pair of small Parlor Palms         | pl-parlor      | S    | 2        |
      | add 5 ZZ Plants, size L                  | pl-zz          | L    | 5        |

  Scenario Outline: Pet-safe is understood however it's said
    When I ask the helper "<phrase>"
    Then the helper calls search_plants with petSafe true
    And the catalog shows only pet-safe plants

    Examples:
      | phrase                             |
      | show me pet-safe plants            |
      | which plants are safe for pets?    |
      | I want something safe for my cat   |
      | any plants that are safe for dogs? |
      | pet-friendly plants please         |

  Scenario Outline: Care answers come from the shop's data
    When I ask the helper "<phrase>"
    Then the helper calls care_tip with plantId "<plantId>" and topic "<topic>"
    And the answer agrees with the shop's data for "<plantId>"

    Examples:
      | phrase                                         | plantId       | topic |
      | is the Peace Lily toxic to cats?               | pl-peace-lily | pets  |
      | can my dog chew on a Spider Plant?             | pl-spider     | pets  |
      | is the Calathea Orbifolia okay around pets?    | pl-calathea   | pets  |
      | how much light does a ZZ Plant need?           | pl-zz         | light |
      | will a Fiddle Leaf Fig survive in a dark room? | pl-fiddle     | light |
      | does Pothos do OK in low light?                | pl-pothos     | light |

  Scenario Outline: The helper never claims an add the shop refused
    When I ask the helper "<phrase>"
    Then the helper calls add_to_cart with plantId "<plantId>", size "<size>" and quantity <quantity>
    And the cart has no "<plantId>"
    And the helper does not say "Added"
    And the helper says the shop refused the add
    And the helper says why: there isn't enough stock

    Examples:
      | phrase                         | plantId   | size | quantity |
      | add five Fiddle Leaf Figs      | pl-fiddle | S    | 5        |
      | add a pair of String of Pearls | pl-pearls | S    | 2        |
      | add 4 medium Hoya Carnosa      | pl-hoya   | M    | 4        |
      | add one Chinese Money Plant    | pl-pilea  | S    | 1        |

  Scenario Outline: A plant the shop doesn't sell is not invented
    When I ask the helper "<phrase>"
    Then the helper says the shop doesn't sell "<plant>"
    And the answer names no price

    Examples:
      | phrase                                  | plant               |
      | how much is a Venus Flytrap?            | Venus Flytrap       |
      | how much light does an Olive Tree need? | Olive Tree          |
      | is a Juniper Bonsai easy to care for?   | Juniper Bonsai      |
      | do you have Dragon Fruit Cactus?        | Dragon Fruit Cactus |
