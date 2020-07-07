import harden from '@agoric/harden';

export default harden(({ board, publicAPI }, _inviteMaker) => {
   
  const cacheOfPromiseForValue = new Map();
  const getFromBoard = boardId => {
    let valueP = cacheOfPromiseForValue.get(boardId);
    if (!valueP) {
      // Cache miss, so try the board.
      valueP = E(board).get(boardId);
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
        extent: dehydratedAmount.extent,
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
            case 'autoswapGetCurrentPrice': {
              const { 
                amountIn: dehydratedAmountIn,
                brandOut: dehydratedBrandOut
              } = data;

              // A dehydrated amount has the form: { brand:
              // brandBoardId, extent }

              // dehydratedBrandOut is a brandBoardId
              const [amountIn, brandOut] = await Promise.all([
                hydrateAmount(dehydratedAmountIn), 
                hydrateBrand(dehydratedBrandOut)
              ]);
              const { extent } = await E(publicAPI).getCurrentPrice(amountIn, brandOut);
              return { type: 'autoswapGetCurrentPriceResponse', data: extent };
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
