// ==UserScript==
// @name           Steam 1-Click Buy Button
// @include        http://store.steampowered.com/*
// @include        https://store.steampowered.com/*
// @description    Adds a button for purchasing games in one click using Steam Wallet funds
// @author         Alex7Kom
// @version        0.2
// @grant          none
// ==/UserScript==

(function () {

function main () {
  var debug = !!localStorage.getItem('1click_debug');
  var forceForNonRefundable = false;

  var $ = jQuery;
  var statusModal;

  var async = {
    series: function (array, callback) {
      this.eachSeries(array, function (item, i, next) {
        item(next);
      }, callback);
    },
    eachSeries: function (array, iterator, callback) {
      var i = -1;
      callback = callback || function(){};
      (function next (error) {
        if (error) {
          return callback(error);
        }

        i++;

        if (i >= array.length) {
          return callback();
        }

        setTimeout(function () {
          iterator(array[i], i, next);
        }, 0);
      })();
    }
  };

  function getCookie (key) {
    var cookies = {};
    document.cookie.split(';').forEach(function (cookie) {
      var cookiePair = cookie.trim().split('=');
      cookies[cookiePair[0]] = decodeURIComponent(cookiePair[1]);
    });
    return cookies[key];
  }

  function emptyCart (itemIds, callback) {
    async.eachSeries(itemIds, function (itemId, i, cb) {
      removeFromCart(itemId, cb);
    }, callback);
  }

  function removeFromCart (itemId, callback) {
    $.ajax({
      url: 'http://store.steampowered.com/cart/',
      type: 'POST',
      data: {
        action: 'remove_line_item',
        sessionid: getCookie('sessionid'),
        lineitem_gid: itemId
      },
      success: function () {
        callback();
      },
      error: function (xhr, errString, error) {
        callback(error);
      }
    });
  }

  function addToCart (itemIds, callback) {
    $.ajax({
      url: 'http://store.steampowered.com/cart/',
      type: 'POST',
      data: {
        action: 'add_to_cart',
        sessionid: getCookie('sessionid'),
        subid: itemIds
      },
      success: function () {
        callback();
      },
      error: function (xhr, errString, error) {
        callback(error);
      }
    });
  }

  function getCurrentCart (callback) {
    $.ajax({
      url: 'http://store.steampowered.com/cart/',
      type: 'GET',
      success: function (data) {
        callback(null, data);
      },
      error: function (xhr, errString, error) {
        callback(error);
      }
    });
  }

  function emptyCurrentCart (cb) {
    getCurrentCart(function (error, data) {
      if (error) {
        return cb(error);
      }

      var itemIds = $(data)
        .find('.cart_row')
        .map(function (i, item) {
          return $(item).attr('id').replace('cart_row_', '');
        });

      emptyCart(itemIds, cb);
    });
  }

  function createStatusModal () {
    statusModal = ShowAlertDialog(
      '1-Click Buy',
      '<h2 id="modal_1click_message">' + 
        '<span id="modal_1click_status">Processing</span>. Please wait...' +
      '</h2>',
      'Close'
    );
    $('.newmodal_close').hide();
    $('.newmodal_buttons').hide();
  }

  function changeStatus (status) {
    $('#modal_1click_status').html(status);
    statusModal.AdjustSizing();
  }

  function changeMessage (message) {
    $('#modal_1click_message').html(message);
    statusModal.AdjustSizing();
    $('.newmodal_close').show();
    $('.newmodal_buttons').show();
  }

  function closeStatusModal () {
    statusModal.Dismiss();
  }

  function redirectToCheckout () {
    window.location.href = 'https://store.steampowered.com/checkout/?purchasetype=self';
  }

  function redirectToCart () {
    window.location.href = 'https://store.steampowered.com/cart/#init1Click';
  }

  function waitForProcessing () {
    changeStatus('Waiting for the transaction to process');
    if ($('#stored_card_processing')[0].style.display !== 'none') {
      return setTimeout(waitForProcessing, 1000);
    }
    finalizeTransaction();
  }

  function waitForStartTransaction () {
    changeStatus('Waiting for a transaction to start');
    if ($('#stored_card_processing')[0].style.display === 'none') {
      return setTimeout(waitForStartTransaction, 1000);
    }
    waitForProcessing();
  }

  function waitForReceipt () {
    changeStatus('Waiting for a receipt');
    if ($('#receipt_area')[0].style.display !== 'block') {
      return setTimeout(waitForReceipt, 1000);
    }
    openInstallDialog();
  }

  function openInstallDialog () {
    changeStatus('Installing');
    var installLink = $('#gotsteam_buttons a').attr('href');
    window.location.href = installLink;
  }

  function validateCart (callback) {
    var cartRows = $('.cart_row');
    if (cartRows.length === 0) {
      return callback('Empty Cart :(');
    }
    async.eachSeries(cartRows, function (row, i, next) {
      if ($(row).find('.cart_item_desc_ext').length > 0) {
        return next(
          'You cannot 1-Click Buy this item. ' +
          'See the notes below the cart.'
        );
      }
      next();
    }, callback);
  }

  function do1ClickPhaseOne (subId) {
    createStatusModal();
    changeStatus('Adding the item to your cart');
    async.series([
      emptyCurrentCart,
      addToCart.bind(null, subId)
    ], function (error) {
      if (error) {
        return console.log(error);
      }
      redirectToCart();
    });

    return false;
  }

  function do1ClickPhaseTwo () {
    localStorage.removeItem('1click');
    createStatusModal();
    changeStatus('Redirecting');
    validateCart(function (error) {
      if (error) {
        changeMessage(error);
        return console.log(error);
      }

      localStorage.setItem('1click', 'true');
      redirectToCheckout();
    });
  }

  function finalizeTransaction () {
    if ($('#review_tab')[0].style.display !== 'block') {
      closeStatusModal();
      changeMessage(
        '1-Click Buy is unsuccessful. ' +
        'Please proceed as a regular order.'
      );
      return;
    }
    changeStatus('Finalizing the transaction');
    $('#accept_ssa').attr('checked', 'checked');
    FinalizeTransaction();
    waitForReceipt();
  }

  function do1ClickPhaseThree () {
    if (localStorage.getItem('1click') !== 'true') {
      return;
    }
    localStorage.removeItem('1click');
    createStatusModal();
    waitForStartTransaction();
  }

  function add1ClickButton () {
    if ($('.already_in_library').length > 0) {
      return;
    }

    $('.game_area_purchase_game_wrapper').each(function (i, gameWrapper) {
      if (
        forceForNonRefundable ||
        $(gameWrapper).find('.game_area_purchase_not_refundable').length > 0
      ) {
        $(gameWrapper).find('.game_area_purchase_not_refundable').append(
          $('<br/><span>1-Click Buy is not available.</span>')
        );
        return;
      }
      var subId = $(gameWrapper).find('form input[name="subid"]').val();
      
      var button;
      if (subId) {
        button = $(
          '<div class="btn_addtocart">' +
            '<a class="btnv6_blue_blue_innerfade btn_medium oneclick-button" href="#">' +
              '<span>1-Click Buy</span>' +
            '</a>' +
          '</div>'
        );
        button.on('click', do1ClickPhaseOne.bind(null, subId));
      } else {
        return;
      }

      var addToCartButton = $(gameWrapper).find('.game_purchase_action_bg:last .btn_addtocart');
      $(addToCartButton).parent().append($('<div class="oneclick-delim">or</div>'));
      $(addToCartButton).parent().append(button);
    });

  }

  function log () {
    if (!debug) return;

    console.log.apply(console, arguments);
  }

  var pathname = window.location.pathname;
  var hash = window.location.hash;
  var search = window.location.search;

  if (pathname === '/cart/' && hash === '#init1Click') {
    do1ClickPhaseTwo();
  }

  if (pathname === '/checkout/' && search.match(/purchasetype=self/) !== null) {
    do1ClickPhaseThree();
  }

  if (pathname.match(/\/app\/\d+/) !== null) {
    add1ClickButton();
  }
}

var script = document.createElement('script');
script.appendChild(document.createTextNode('('+ main +')();'));
(document.body || document.head || document.documentElement).appendChild(script);

var style = document.createElement('style');
style.innerHTML = 
  '.oneclick-delim {' +
    'margin: 0 10px;' +
    'display: inline-block;' +
    'font-size: 14px;' +
  '}' +
  '.btnv6_blue_blue_innerfade.oneclick-button {' +
    'color: #d0cbcb !important;' +
  '}' +
  '.btnv6_blue_blue_innerfade.oneclick-button:not(.btn_disabled):not(.btn_active):hover:not(.active):hover {' +
    'color: #ffffff !important;' +
  '}' +
  '.game_area_purchase_not_refundable {' +
    'height: 36px;' +
  '}'
;
(document.body || document.head || document.documentElement).appendChild(style);

})();
