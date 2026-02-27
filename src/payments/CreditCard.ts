import { CreditCardComponent } from './CreditCardComponent';
import { useCreditCardController } from './useCreditCardController';

/**
 * CreditCard namespace — matches Alan's spec API shape.
 *
 * Usage:
 *   const cc = CreditCard.useController()
 *   <CreditCard.Component controller={cc} />
 *   const token = await cc.tokenize()
 */
export const CreditCard = {
  Component: CreditCardComponent,
  useController: useCreditCardController,
};
