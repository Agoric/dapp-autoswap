import { E } from '@agoric/eventual-send';
import { makeWebSocketHandler } from './lib-http';

export default harden(
  ({ board, http, publicFacet, invitationIssuer }, _invitationMaker) => {
    const cacheOfPromiseForValue = new Map();
    const getFromBoard = boardId => {
      let valueP = cacheOfPromiseForValue.get(boardId);
      if (!valueP) {
        // Cache miss, so try the board.
        valueP = E(board).getValue(boardId);
        cacheOfPromiseForValue.set(boardId, valueP);
      }
      return valueP;
    };

    // returns a promise
    const hydrateBrand = dehydratedBrand => getFromBoard(dehydratedBrand);

    // returns a promise
    const hydrateAmount = dehydratedAmount => {
      return hydrateBrand(dehydratedAmount.brand).then(brand => {
        return {
          brand,
          value: dehydratedAmount.value,
        };
      });
    };

    return makeWebSocketHandler(http, (send, _meta) =>
      harden({
        async onMessage(obj, _messageMeta) {
          const { type, data } = obj;
          switch (type) {
            case 'autoswap/getInputPrice': {
              const {
                amountIn: dehydratedAmountIn,
                brandOut: dehydratedBrandOut,
              } = data;

              // A dehydrated amount has the form: { brand:
              // brandBoardId, value }

              // dehydratedBrandOut is a brandBoardId
              const [amountIn, brandOut] = await Promise.all([
                hydrateAmount(dehydratedAmountIn),
                hydrateBrand(dehydratedBrandOut),
              ]);
              const { value } = await E(publicFacet).getInputPrice(
                amountIn,
                brandOut,
              );
              send({ type: 'autoswap/getInputPriceResponse', data: value });
              return true;
            }

            case 'autoswap/sendSwapInvitation': {
              const { depositFacetId, offer } = obj.data;
              const depositFacet = E(board).getValue(depositFacetId);
              const invitation = await E(publicFacet).makeSwapInvitation();
              const invitationAmount = await E(invitationIssuer).getAmountOf(
                invitation,
              );
              const {
                value: [{ handle }],
              } = invitationAmount;
              const invitationHandleBoardId = await E(board).getId(handle);
              const updatedOffer = { ...offer, invitationHandleBoardId };
              // We need to wait for the invitation to be
              // received, or we will possibly win the race of
              // proposing the offer before the invitation is ready.
              // TODO: We should make this process more robust.
              await E(depositFacet).receive(invitation);

              send({
                type: 'autoswap/sendSwapInvitationResponse',
                data: { offer: updatedOffer },
              });
              return true;
            }

            default: {
              return undefined;
            }
          }
        },
      }),
    );
  },
);
