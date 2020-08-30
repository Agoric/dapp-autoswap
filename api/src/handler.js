import harden from '@agoric/harden';
import { E } from '@agoric/eventual-send';

export default harden(({ board, publicFacet, invitationIssuer }, _invitationMaker) => {
   
  const cacheOfPromiseForValue = new Map();
  const getFromBoard = boardId => {
    let valueP = cacheOfPromiseForValue.get(boardId);
    if (!valueP) {
      // Cache miss, so try the board.
      valueP = E(board).getValue(boardId);
      cacheOfPromiseForValue.set(boardId, valueP);
    }
    return valueP;
  }

  // returns a promise
  const hydrateBrand = dehydratedBrand => getFromBoard(dehydratedBrand);
  
  // returns a promise
  const hydrateAmount = dehydratedAmount => {
    return hydrateBrand(dehydratedAmount.brand).then(brand => {
      return {
        brand,
        value: dehydratedAmount.value,
      };
    })
  };

  return harden({
    getCommandHandler() {
      return harden({
        onError(obj, _meta) {
          console.error('Have error', obj);
        },
        onOpen: (_obj, _meta) => {},
        onClose: (_obj, _meta) => {},
        async onMessage(obj, _meta) {
          const { type, data } = obj;
          switch (type) {
            case 'autoswap/getInputPrice': {
              const { 
                amountIn: dehydratedAmountIn,
                brandOut: dehydratedBrandOut
              } = data;

              // A dehydrated amount has the form: { brand:
              // brandBoardId, value }

              // dehydratedBrandOut is a brandBoardId
              const [amountIn, brandOut] = await Promise.all([
                hydrateAmount(dehydratedAmountIn), 
                hydrateBrand(dehydratedBrandOut)
              ]);
              const { value } = await E(publicFacet).getInputPrice(amountIn, brandOut);
              return { type: 'autoswap/getInputPriceResponse', data: value };
            }

            case 'autoswap/sendSwapInvitation': {
              const { depositFacetId, offer } = obj.data;
              const depositFacet = E(board).getValue(depositFacetId);
              const invitation = await E(publicFacet).makeSwapInvitation();
              const invitationAmount = await E(invitationIssuer).getAmountOf(invitation);
              const { value: [{ handle }]} = invitationAmount;
              const invitationHandleBoardId = await E(board).getId(handle);
              const updatedOffer = { ...offer, invitationHandleBoardId };
              // We need to wait for the invitation to be
              // received, or we will possibly win the race of
              // proposing the offer before the invitation is ready.
              // TODO: We should make this process more robust.
              await E(depositFacet).receive(invitation);
              
              return harden({
                type: 'autoswap/sendSwapInvitationResponse',
                data: { offer: updatedOffer },
              });
            }

            default: {
              return false;
            }
          }
        },
      });
    },
  });
});
